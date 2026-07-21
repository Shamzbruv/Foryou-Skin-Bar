-- Add boolean flags for product attributes and global disclaimer
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_sulphate_free boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_paraben_free boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_mineral_oil_free boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_cruelty_free boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_handmade_in_jamaica boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_results_disclaimer boolean DEFAULT true;
