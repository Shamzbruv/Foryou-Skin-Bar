create table ingredient_rules (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null,
  normalized_name text not null unique,
  helps_concerns text[] default '{}',
  good_for_skin_types text[] default '{}',
  avoid_for_skin_types text[] default '{}',
  strength_score int default 1,
  sensitivity_warning boolean default false,
  notes text,
  created_at timestamptz default now()
);

create table product_recommendation_profiles (
  product_id uuid primary key references products(id) on delete cascade,
  skin_types text[] default '{}',
  avoid_for text[] default '{}',
  routine_step text,
  product_use text default 'both',
  intensity text default 'medium',
  is_daily_safe boolean default true,
  is_sensitive_friendly boolean default false,
  updated_at timestamptz default now()
);

create table product_ingredients (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  ingredient_name text not null,
  normalized_name text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- RLS Policies
alter table ingredient_rules enable row level security;
alter table product_recommendation_profiles enable row level security;
alter table product_ingredients enable row level security;

-- We assume a function `is_admin()` exists or we allow public selects as per user request
-- For public selects
create policy "Public can read ingredient rules"
on ingredient_rules for select using (true);

-- The previous schema might have used auth.role() = 'authenticated' for admins or similar
-- The prompt explicitly asks to use public.is_admin() for admin manage
create policy "Admins can manage ingredient rules"
on ingredient_rules for all
using (public.is_admin())
with check (public.is_admin());

create policy "Public can read product ingredients"
on product_ingredients for select using (true);

create policy "Admins can manage product ingredients"
on product_ingredients for all
using (public.is_admin())
with check (public.is_admin());

create policy "Public can read recommendation profiles"
on product_recommendation_profiles for select using (true);

create policy "Admins can manage recommendation profiles"
on product_recommendation_profiles for all
using (public.is_admin())
with check (public.is_admin());
