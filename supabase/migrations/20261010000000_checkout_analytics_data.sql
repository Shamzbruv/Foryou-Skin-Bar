-- Google Analytics identifiers captured on the checkout page (client id + session id).
-- Stored with the checkout session so that when payment is confirmed (Fygaro webhook) the server can
-- report the purchase/refund to GA4 and credit it to the visitor's original session.
-- Nullable and additive: existing rows and the checkout flow are unaffected.
ALTER TABLE public.payment_checkout_sessions
  ADD COLUMN IF NOT EXISTS analytics_data jsonb;
