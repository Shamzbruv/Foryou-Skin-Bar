-- Drop NOT NULL constraint on product_id in product_reviews table
ALTER TABLE public.product_reviews
ALTER COLUMN product_id DROP NOT NULL;
