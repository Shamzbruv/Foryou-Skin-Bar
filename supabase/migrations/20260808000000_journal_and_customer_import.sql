-- Foryou Skin Journal taxonomy and legacy customer import support.

alter table public.blog_posts
  add column if not exists primary_topic text not null default 'healthy-skin',
  add column if not exists article_type text not null default 'guide',
  add column if not exists is_new_this_week boolean not null default false,
  add column if not exists is_featured boolean not null default false,
  add column if not exists reading_time_minutes integer,
  add column if not exists related_post_slugs text[] not null default '{}'::text[];

do $$ begin
  alter table public.blog_posts add constraint blog_posts_primary_topic_check check (
    primary_topic in ('acne', 'dark-spots-hyperpigmentation', 'skincare-routines', 'ingredients-library', 'healthy-skin', 'skin-school', 'jamaican-skincare')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.blog_posts add constraint blog_posts_article_type_check check (
    article_type in ('foundation', 'supporting', 'guide', 'weekly')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.blog_posts add constraint blog_posts_reading_time_check check (
    reading_time_minutes is null or reading_time_minutes between 1 and 90
  );
exception when duplicate_object then null; end $$;

create index if not exists idx_blog_posts_journal_topic
  on public.blog_posts (primary_topic, published_at desc)
  where status = 'published';
create index if not exists idx_blog_posts_new_this_week
  on public.blog_posts (published_at desc)
  where status = 'published' and is_new_this_week = true;

-- Promote the three complete guides to the journal's permanent foundations.
update public.blog_posts set
  primary_topic = 'acne', article_type = 'foundation', is_featured = true,
  reading_time_minutes = greatest(10, ceil(length(coalesce(content, '')) / 1200.0)::integer),
  related_post_slugs = array['why-acne-keeps-coming-back-how-to-stop-the-cycle', 'difference-between-acne-scars-and-hyperpigmentation', 'hormonal-acne-explained']
where slug = 'complete-guide-to-acne';

update public.blog_posts set
  primary_topic = 'dark-spots-hyperpigmentation', article_type = 'foundation', is_featured = true,
  reading_time_minutes = greatest(10, ceil(length(coalesce(content, '')) / 1200.0)::integer),
  related_post_slugs = array['difference-between-acne-scars-and-hyperpigmentation', 'how-long-does-it-take-to-fade-dark-spots', 'hyperpigmentation-mistakes-how-to-fix-them']
where slug = 'complete-guide-to-hyperpigmentation';

update public.blog_posts set
  primary_topic = 'skincare-routines', article_type = 'foundation', is_featured = true,
  reading_time_minutes = greatest(10, ceil(length(coalesce(content, '')) / 1200.0)::integer),
  related_post_slugs = array['understanding-the-basics-of-skincare-for-healthy-skin', 'how-to-keep-acne-dark-spots-away', 'complete-guide-to-acne']
where slug = 'complete-guide-to-skincare-routine';

-- Supporting articles extend the foundations into practical next steps.
update public.blog_posts set
  primary_topic = 'acne', article_type = 'supporting',
  reading_time_minutes = greatest(4, ceil(length(coalesce(content, '')) / 1200.0)::integer),
  related_post_slugs = array['complete-guide-to-acne', 'can-stress-cause-acne', 'hormonal-acne-explained']
where slug = 'why-acne-keeps-coming-back-how-to-stop-the-cycle';

update public.blog_posts set
  primary_topic = 'dark-spots-hyperpigmentation', article_type = 'supporting',
  reading_time_minutes = greatest(4, ceil(length(coalesce(content, '')) / 1200.0)::integer),
  related_post_slugs = array['complete-guide-to-hyperpigmentation', 'how-long-does-it-take-to-fade-dark-spots', 'difference-between-acne-scars-and-hyperpigmentation']
where slug = 'hyperpigmentation-mistakes-how-to-fix-them';

update public.blog_posts set
  primary_topic = 'healthy-skin', article_type = 'supporting',
  reading_time_minutes = greatest(4, ceil(length(coalesce(content, '')) / 1200.0)::integer),
  related_post_slugs = array['complete-guide-to-skincare-routine', 'how-to-keep-acne-dark-spots-away', 'natural-ingredients-brighten-even-skin-tone']
where slug = 'understanding-the-basics-of-skincare-for-healthy-skin';

-- Classify the remaining library so every article is browsable by topic.
update public.blog_posts set primary_topic = 'jamaican-skincare', reading_time_minutes = greatest(4, ceil(length(coalesce(content, '')) / 1200.0)::integer)
where slug in ('jamaican-skincare-secrets-local-ingredients-that-work-wonders', 'clean-beauty-hyperpigmentation-jamaican-women', 'benefits-of-handcrafted-skincare', 'personal-journeys-shape-beauty-industry');
update public.blog_posts set primary_topic = 'ingredients-library', reading_time_minutes = greatest(4, ceil(length(coalesce(content, '')) / 1200.0)::integer)
where slug = 'natural-ingredients-brighten-even-skin-tone';
update public.blog_posts set primary_topic = 'skincare-routines', reading_time_minutes = greatest(4, ceil(length(coalesce(content, '')) / 1200.0)::integer)
where slug = 'how-to-keep-acne-dark-spots-away';
update public.blog_posts set primary_topic = 'skin-school', reading_time_minutes = greatest(4, ceil(length(coalesce(content, '')) / 1200.0)::integer)
where slug = 'from-breakouts-to-glow-a-step-by-step-guide-to-cleat-skin';

-- CRM fields retain legacy detail while clearly distinguishing current account status.
alter table public.customers
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists alternate_phones text[] not null default '{}'::text[],
  add column if not exists alternate_addresses jsonb not null default '[]'::jsonb,
  add column if not exists labels text[] not null default '{}'::text[],
  add column if not exists legacy_sources text[] not null default '{}'::text[],
  add column if not exists preferred_language text,
  add column if not exists customer_origin text not null default 'system',
  add column if not exists was_imported boolean not null default false,
  add column if not exists imported_at timestamptz,
  add column if not exists import_batch text,
  add column if not exists account_user_id uuid references auth.users(id) on delete set null,
  add column if not exists account_created_at timestamptz,
  add column if not exists email_marketing_status text not null default 'unknown',
  add column if not exists sms_marketing_status text not null default 'unknown',
  add column if not exists legacy_created_at timestamptz,
  add column if not exists legacy_last_activity text,
  add column if not exists legacy_last_activity_at timestamptz,
  add column if not exists email_quality_status text not null default 'valid';

do $$ begin
  alter table public.customers add constraint customers_origin_check check (
    customer_origin in ('system', 'imported', 'account', 'checkout', 'manual', 'newsletter')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.customers add constraint customers_email_marketing_check check (
    email_marketing_status in ('subscribed', 'unsubscribed', 'never_subscribed', 'unknown')
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.customers add constraint customers_sms_marketing_check check (
    sms_marketing_status in ('subscribed', 'unsubscribed', 'never_subscribed', 'unknown')
  );
exception when duplicate_object then null; end $$;

create index if not exists idx_customers_email_lower on public.customers (lower(email)) where email is not null;
create index if not exists idx_customers_account_user on public.customers (account_user_id) where account_user_id is not null;
create index if not exists idx_customers_origin on public.customers (customer_origin, created_at desc);

-- Link existing Supabase accounts by normalized email while retaining import history.
update public.customers as customer set
  account_user_id = account.id,
  account_created_at = account.created_at,
  customer_origin = 'account',
  updated_at = now()
from auth.users as account
where customer.email is not null
  and lower(customer.email) = lower(account.email)
  and customer.account_user_id is null;

create table if not exists public.customer_import_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  batch_key text not null,
  source_row_key text not null,
  source text,
  imported_email_status text,
  imported_sms_status text,
  raw_data jsonb not null,
  imported_at timestamptz not null default now(),
  unique (batch_key, source_row_key)
);

create index if not exists idx_customer_import_history_customer
  on public.customer_import_history (customer_id, imported_at desc);

alter table public.customer_import_history enable row level security;
drop policy if exists "Admins can manage customer import history" on public.customer_import_history;
create policy "Admins can manage customer import history"
  on public.customer_import_history for all
  using (public.is_admin()) with check (public.is_admin());
grant all on public.customer_import_history to authenticated;
grant all on public.customer_import_history to service_role;

alter table public.newsletter_subscribers
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists consent_status text not null default 'subscribed',
  add column if not exists consent_source text,
  add column if not exists subscribed_at timestamptz,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.newsletter_subscribers add constraint newsletter_consent_status_check check (
    consent_status in ('subscribed', 'unsubscribed', 'never_subscribed', 'unknown')
  );
exception when duplicate_object then null; end $$;

update public.newsletter_subscribers
set consent_status = case when is_active then 'subscribed' else 'unsubscribed' end,
    subscribed_at = case when is_active then coalesce(subscribed_at, created_at) else subscribed_at end,
    updated_at = coalesce(updated_at, created_at);

create index if not exists idx_newsletter_customer on public.newsletter_subscribers (customer_id);
