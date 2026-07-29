-- Count one view per browser, per article, per Jamaica calendar day.
alter table public.blog_posts
  add column if not exists view_count bigint not null default 0;

create table if not exists public.blog_views (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  visitor_key uuid not null,
  viewed_on date not null,
  created_at timestamptz not null default now(),
  unique (post_id, visitor_key, viewed_on)
);

create index if not exists idx_blog_views_post_created
  on public.blog_views(post_id, created_at desc);

alter table public.blog_views enable row level security;

drop policy if exists "Admins can manage blog views" on public.blog_views;
create policy "Admins can manage blog views"
on public.blog_views for all
using (public.is_admin())
with check (public.is_admin());

grant all on public.blog_views to service_role;

create or replace function public.register_blog_view(
  p_post_id uuid,
  p_visitor_key uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_view_count bigint;
  v_inserted integer;
begin
  if not exists (
    select 1 from public.blog_posts
    where id = p_post_id and status = 'published'
  ) then
    raise exception 'Published blog post not found';
  end if;

  insert into public.blog_views (post_id, visitor_key, viewed_on)
  values (p_post_id, p_visitor_key, (now() at time zone 'America/Jamaica')::date)
  on conflict (post_id, visitor_key, viewed_on) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.blog_posts
    set view_count = view_count + 1
    where id = p_post_id
    returning view_count into v_view_count;
  else
    select view_count into v_view_count
    from public.blog_posts
    where id = p_post_id;
  end if;

  return coalesce(v_view_count, 0);
end;
$$;

revoke all on function public.register_blog_view(uuid, uuid) from public;
grant execute on function public.register_blog_view(uuid, uuid) to anon, authenticated;
