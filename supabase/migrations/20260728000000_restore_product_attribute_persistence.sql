-- Restore the product fields used by the admin attribute editor and storefront.
-- This migration is intentionally idempotent because some environments may
-- already have some or all of these columns.
alter table public.products
  add column if not exists is_sulphate_free boolean not null default false,
  add column if not exists is_paraben_free boolean not null default false,
  add column if not exists is_mineral_oil_free boolean not null default false,
  add column if not exists is_cruelty_free boolean not null default false,
  add column if not exists is_handmade_in_jamaica boolean not null default false,
  add column if not exists has_results_disclaimer boolean not null default true;

notify pgrst, 'reload schema';
