-- Migration: Closeout Schema Updates
-- Tables: product_concerns, discount_codes, product_reviews, blog_posts

-- 1. Product Concerns mapping
create table if not exists public.product_concerns (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade not null,
  concern_slug text not null,
  created_at timestamptz default now()
);

alter table public.product_concerns enable row level security;
create policy "Allow public read access on product_concerns" on public.product_concerns for select using (true);
create policy "Allow full access to service role on product_concerns" on public.product_concerns for all using (true);

-- 2. Discount Codes
create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_type text not null, -- 'percent' or 'fixed'
  discount_value numeric(10,2) not null,
  minimum_subtotal numeric(10,2),
  usage_limit int,
  used_count int default 0,
  active boolean default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz default now()
);

alter table public.discount_codes enable row level security;
create policy "Allow public read access on discount_codes" on public.discount_codes for select using (true);
create policy "Allow full access to service role on discount_codes" on public.discount_codes for all using (true);

-- 2.5. Alter orders to track discount
alter table public.orders add column if not exists discount_code text;

-- 3. Product Reviews
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade not null,
  customer_name text not null,
  rating int check (rating between 1 and 5) not null,
  review_text text not null,
  approved boolean default false,
  created_at timestamptz default now()
);

alter table public.product_reviews enable row level security;
create policy "Allow public read access on approved product_reviews" on public.product_reviews for select using (approved = true);
create policy "Allow full access to service role on product_reviews" on public.product_reviews for all using (true);

