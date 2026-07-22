-- Preserve sales history when an admin removes a product from the catalog.
alter table public.order_items
  drop constraint if exists order_items_product_id_fkey;

alter table public.order_items
  add constraint order_items_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

alter table public.order_items
  drop constraint if exists order_items_variant_id_fkey;

alter table public.order_items
  add constraint order_items_variant_id_fkey
  foreign key (variant_id) references public.product_variants(id) on delete set null;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_product_id_fkey;

alter table public.inventory_movements
  add constraint inventory_movements_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

alter table public.quiz_recommendation_rules
  drop constraint if exists quiz_recommendation_rules_product_id_fkey;

alter table public.quiz_recommendation_rules
  add constraint quiz_recommendation_rules_product_id_fkey
  foreign key (product_id) references public.products(id) on delete cascade;

-- Ensure every published article has a sortable, editable publication time.
update public.blog_posts
set published_at = coalesce(published_at, created_at, now())
where status = 'published' and published_at is null;

create table if not exists public.blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  author_name text not null check (char_length(btrim(author_name)) between 2 and 80),
  comment_text text not null check (char_length(btrim(comment_text)) between 1 and 2000),
  user_id uuid references auth.users(id) on delete set null,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  visitor_key uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (post_id, visitor_key)
);

create index if not exists idx_blog_comments_post_created
  on public.blog_comments(post_id, created_at desc);

create index if not exists idx_blog_likes_post
  on public.blog_likes(post_id);

alter table public.blog_comments enable row level security;
alter table public.blog_likes enable row level security;

drop policy if exists "Public can view visible blog comments" on public.blog_comments;
create policy "Public can view visible blog comments"
on public.blog_comments for select
using (
  is_visible = true
  and exists (
    select 1 from public.blog_posts
    where blog_posts.id = blog_comments.post_id
      and blog_posts.status = 'published'
  )
);

drop policy if exists "Public can add blog comments" on public.blog_comments;
create policy "Public can add blog comments"
on public.blog_comments for insert
with check (
  is_visible = true
  and char_length(btrim(author_name)) between 2 and 80
  and char_length(btrim(comment_text)) between 1 and 2000
  and (user_id is null or user_id = auth.uid())
  and exists (
    select 1 from public.blog_posts
    where blog_posts.id = blog_comments.post_id
      and blog_posts.status = 'published'
  )
);

drop policy if exists "Admins can manage blog comments" on public.blog_comments;
create policy "Admins can manage blog comments"
on public.blog_comments for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can view blog likes" on public.blog_likes;
create policy "Public can view blog likes"
on public.blog_likes for select
using (
  exists (
    select 1 from public.blog_posts
    where blog_posts.id = blog_likes.post_id
      and blog_posts.status = 'published'
  )
);

drop policy if exists "Admins can manage blog likes" on public.blog_likes;
create policy "Admins can manage blog likes"
on public.blog_likes for all
using (public.is_admin())
with check (public.is_admin());

grant select, insert on public.blog_comments to anon;
grant select, insert, delete on public.blog_comments to authenticated;
grant select on public.blog_likes to anon;
grant select, delete on public.blog_likes to authenticated;
grant all on public.blog_comments, public.blog_likes to service_role;

create or replace function public.toggle_blog_like(
  p_post_id uuid,
  p_visitor_key uuid
)
returns table (liked boolean, like_count bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_liked boolean;
begin
  if not exists (
    select 1 from public.blog_posts
    where id = p_post_id and status = 'published'
  ) then
    raise exception 'Published blog post not found';
  end if;

  delete from public.blog_likes
  where post_id = p_post_id and visitor_key = p_visitor_key;

  if found then
    v_liked := false;
  else
    insert into public.blog_likes (post_id, visitor_key, user_id)
    values (p_post_id, p_visitor_key, auth.uid());
    v_liked := true;
  end if;

  return query
  select v_liked, count(*)::bigint
  from public.blog_likes
  where post_id = p_post_id;
end;
$$;

revoke all on function public.toggle_blog_like(uuid, uuid) from public;
grant execute on function public.toggle_blog_like(uuid, uuid) to anon, authenticated;

