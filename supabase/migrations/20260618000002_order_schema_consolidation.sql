-- Migration: Order Schema Consolidation & RLS Fixes
-- This migration standardizes the `orders` and `order_items` tables around the canonical admin schema
-- and corrects overly permissive RLS policies from previous migrations.

-- 1. Ensure canonical orders columns exist
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS status text CHECK (status IN ('pending', 'confirmed', 'processing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled', 'refunded')) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_status text CHECK (payment_status IN ('unpaid', 'awaiting_confirmation', 'paid', 'partially_paid', 'refunded')) DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS fulfillment_status text CHECK (fulfillment_status IN ('unfulfilled', 'packed', 'shipped', 'delivered', 'picked_up')) DEFAULT 'unfulfilled',
  ADD COLUMN IF NOT EXISTS delivery_method text CHECK (delivery_method IN ('delivery', 'pickup')),
  ADD COLUMN IF NOT EXISTS delivery_service text, -- new: Zipmail, Knutsford, Bearer, Overseas, etc.
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Jamaica',
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state_province text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS parish text,
  ADD COLUMN IF NOT EXISTS subtotal_jmd numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_code text,
  ADD COLUMN IF NOT EXISTS discount_total_jmd numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_total_jmd numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grand_total_jmd numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_notes text,
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- 2. Ensure canonical order_items columns exist
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id),
  ADD COLUMN IF NOT EXISTS variant_name text,
  ADD COLUMN IF NOT EXISTS unit_price_jmd numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total_jmd numeric(12,2) DEFAULT 0;

-- 3. Fix RLS Policies for product_concerns
DROP POLICY IF EXISTS "Allow full access to service role on product_concerns" ON public.product_concerns;
DROP POLICY IF EXISTS "Allow public read access on product_concerns" ON public.product_concerns;

CREATE POLICY "Public can read product concerns" ON public.product_concerns FOR SELECT USING (true);
CREATE POLICY "Admins can manage product concerns" ON public.product_concerns FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4. Fix RLS Policies for discount_codes
DROP POLICY IF EXISTS "Allow full access to service role on discount_codes" ON public.discount_codes;
DROP POLICY IF EXISTS "Allow public read access on discount_codes" ON public.discount_codes;

CREATE POLICY "Admins can manage discount codes" ON public.discount_codes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. Fix RLS Policies for product_reviews
DROP POLICY IF EXISTS "Allow full access to service role on product_reviews" ON public.product_reviews;
DROP POLICY IF EXISTS "Allow public read access on approved product_reviews" ON public.product_reviews;

CREATE POLICY "Public can read approved reviews" ON public.product_reviews FOR SELECT USING (approved = true);
CREATE POLICY "Public can submit pending reviews" ON public.product_reviews FOR INSERT WITH CHECK (approved = false);
CREATE POLICY "Admins can manage reviews" ON public.product_reviews FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6. Ensure email_logs exists for the new Edge Function flow
CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  email_type text NOT NULL,
  resend_email_id text,
  status text DEFAULT 'sent',
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view email logs" ON public.email_logs;
CREATE POLICY "Admins can view email logs" ON public.email_logs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
