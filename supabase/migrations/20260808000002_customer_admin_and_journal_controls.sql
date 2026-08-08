-- Customer administration and fully editable Foryou Skin Journal page settings.

alter table public.blog_posts
  add column if not exists journal_sort_order integer not null default 100;

do $$ begin
  alter table public.blog_posts add constraint blog_posts_journal_sort_order_check
    check (journal_sort_order between 0 and 9999);
exception when duplicate_object then null; end $$;

-- Preserve transactional records when an administrator removes a CRM profile.
alter table public.orders drop constraint if exists orders_customer_id_fkey;
alter table public.orders
  add constraint orders_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

alter table public.discount_redemptions drop constraint if exists discount_redemptions_customer_id_fkey;
alter table public.discount_redemptions
  add constraint discount_redemptions_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

alter table public.payment_checkout_sessions alter column customer_id drop not null;
alter table public.payment_checkout_sessions drop constraint if exists payment_checkout_sessions_customer_id_fkey;
alter table public.payment_checkout_sessions
  add constraint payment_checkout_sessions_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

-- Remove a CRM profile and marketing/import data without deleting accounting history.
create or replace function public.admin_delete_customer_record(target_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_email text;
  preserved_orders integer;
  preserved_checkouts integer;
  removed_subscribers integer;
  removed_import_rows integer;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'Admin privileges are required.' using errcode = '42501';
  end if;

  select email into customer_email
  from public.customers
  where id = target_customer_id
  for update;

  if not found then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  select count(*) into preserved_orders
  from public.orders
  where customer_id = target_customer_id;

  select count(*) into preserved_checkouts
  from public.payment_checkout_sessions
  where customer_id = target_customer_id;

  delete from public.newsletter_subscribers
  where customer_id = target_customer_id
     or (customer_email is not null and lower(email) = lower(customer_email));
  get diagnostics removed_subscribers = row_count;

  delete from public.customer_import_history
  where customer_id = target_customer_id;
  get diagnostics removed_import_rows = row_count;

  delete from public.customers
  where id = target_customer_id;

  return jsonb_build_object(
    'success', true,
    'preserved_orders', preserved_orders,
    'preserved_payment_checkouts', preserved_checkouts,
    'removed_newsletter_records', removed_subscribers,
    'removed_import_rows', removed_import_rows
  );
end;
$$;

revoke all on function public.admin_delete_customer_record(uuid) from public, anon;
grant execute on function public.admin_delete_customer_record(uuid) to authenticated, service_role;

-- Replace the legacy broad authenticated-write policy with the standard admin check.
drop policy if exists "Allow authenticated updates to site_content" on public.site_content;
drop policy if exists "Admins can manage site_content" on public.site_content;
create policy "Admins can manage site_content"
  on public.site_content for all
  using (public.is_admin()) with check (public.is_admin());

insert into public.site_content (key, value, updated_at)
values (
  'journal_page',
  '{
    "hero_eyebrow":"Education by Foryou Skin Bar",
    "hero_title":"Foryou Skin Journal",
    "hero_tagline":"Healthy Skin. Real Knowledge. Lasting Confidence.",
    "hero_description":"Trusted skincare education from Foryou Skin Bar, written to help you understand your skin and make informed routine choices.",
    "hero_image_url":"assets/blog/blog_science.png",
    "manifesto_eyebrow":"Editorial Manifesto",
    "manifesto_title":"Knowledge should make skincare feel clearer.",
    "manifesto_body_1":"The Foryou Skin Journal is an educational centre for thoughtful, practical skincare. We explain concerns without shame, ingredients without hype, and routines without unnecessary complexity.",
    "manifesto_body_2":"Our articles are organized as guided reading: begin with a foundation, follow the supporting articles, and return as the library grows. We cite reputable health sources, distinguish education from medical care, and write with melanin-rich skin and Jamaican life in mind.",
    "weekly_eyebrow":"Fresh Reading",
    "weekly_title":"New This Week",
    "weekly_description":"Four focused answers to questions readers ask most.",
    "weekly_limit":4,
    "topics_eyebrow":"Find Your Path",
    "topics_title":"Browse by Topic",
    "foundation_eyebrow":"Start Here",
    "foundation_title":"Foundation Guides",
    "foundation_description":"Long-form guides that anchor the Journal''s learning paths.",
    "foundation_limit":3,
    "library_eyebrow":"Explore Everything",
    "library_title":"The Article Library",
    "cta_eyebrow":"Continue Learning",
    "cta_title":"New education, delivered thoughtfully.",
    "cta_description":"Join Glow Letters for new Journal articles, practical routines, and considered product updates.",
    "cta_button_text":"Join Glow Letters",
    "cta_button_url":"#newsletterForm",
    "seo_title":"Foryou Skin Journal | Trusted Skincare Education",
    "seo_description":"Explore trusted skincare education for acne, dark spots, routines, ingredients, healthy skin, and Jamaican skincare from Foryou Skin Bar.",
    "social_image_url":"assets/blog/blog_science.png",
    "topics":[
      {"slug":"acne","name":"Acne"},
      {"slug":"dark-spots-hyperpigmentation","name":"Dark Spots & Hyperpigmentation"},
      {"slug":"skincare-routines","name":"Skincare Routines"},
      {"slug":"ingredients-library","name":"Ingredients Library"},
      {"slug":"healthy-skin","name":"Healthy Skin"},
      {"slug":"skin-school","name":"Skin School"},
      {"slug":"jamaican-skincare","name":"Jamaican Skincare"}
    ]
  }'::jsonb,
  now()
)
on conflict (key) do nothing;
