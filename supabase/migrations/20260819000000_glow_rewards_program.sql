-- Glow & Go Inner Circle rewards programme: real ledger + rules engine schema.
-- Replaces the old flat-counter trigger (20260703000001_points_trigger.sql) with an
-- application-driven ledger so purchase/birthday/review/referral/Glow-Day/manual credits,
-- 6-month expiry, and redemption can all be tracked and reversed accurately.

-- 1. Customer profile additions -----------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS lifetime_purchase_jmd numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by_customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS last_birthday_award_year int,
  ADD COLUMN IF NOT EXISTS quiz_bonus_awarded_at timestamptz;

-- loyalty_points_balance / lifetime_earned_points already exist (20260703000000). They
-- become cached/informational snapshots refreshed by the engine; the ledger below is
-- the source of truth for spendable balance.

-- 2. The credits ledger ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.glow_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'earn_purchase','earn_signup','earn_birthday','earn_review','earn_referral',
    'earn_quiz','earn_social','earn_glow_day_bonus','earn_manual',
    'redeem','expire','reverse_refund','reverse_manual'
  )),
  amount numeric(12,2) NOT NULL,
  remaining numeric(12,2),
  order_id uuid REFERENCES public.orders(id),
  reference_id uuid,
  note text,
  created_by uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_glow_credit_transactions_customer ON public.glow_credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_glow_credit_transactions_expires ON public.glow_credit_transactions(expires_at);
CREATE INDEX IF NOT EXISTS idx_glow_credit_transactions_order ON public.glow_credit_transactions(order_id);

ALTER TABLE public.glow_credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage glow_credit_transactions" ON public.glow_credit_transactions;
CREATE POLICY "Admins can manage glow_credit_transactions" ON public.glow_credit_transactions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3. Glow Days (bonus-multiplier events) ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.glow_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  multiplier numeric(4,2) NOT NULL DEFAULT 1,
  bonus_flat_credits numeric(12,2) NOT NULL DEFAULT 0,
  min_spend_jmd numeric(12,2) NOT NULL DEFAULT 0,
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all','category','min_spend')),
  category text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_glow_days_window ON public.glow_days(starts_at, ends_at) WHERE active;

ALTER TABLE public.glow_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage glow_days" ON public.glow_days;
CREATE POLICY "Admins can manage glow_days" ON public.glow_days FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Public can read active glow_days" ON public.glow_days;
CREATE POLICY "Public can read active glow_days" ON public.glow_days FOR SELECT USING (active = true);

-- 4. Referrals --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.glow_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_customer_id uuid NOT NULL REFERENCES public.customers(id),
  referee_customer_id uuid REFERENCES public.customers(id),
  referee_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','expired')),
  reward_credits numeric(12,2),
  completed_order_id uuid REFERENCES public.orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_glow_referrals_referrer ON public.glow_referrals(referrer_customer_id);

ALTER TABLE public.glow_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage glow_referrals" ON public.glow_referrals;
CREATE POLICY "Admins can manage glow_referrals" ON public.glow_referrals FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. VIP semi-annual product reward fulfilment tracker -----------------------------------
CREATE TABLE IF NOT EXISTS public.glow_vip_product_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  period_label text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled')),
  fulfilled_at timestamptz,
  fulfilled_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, period_label)
);

ALTER TABLE public.glow_vip_product_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage glow_vip_product_rewards" ON public.glow_vip_product_rewards;
CREATE POLICY "Admins can manage glow_vip_product_rewards" ON public.glow_vip_product_rewards FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6. Discount codes: support customer-locked redemption/referral codes ------------------
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'promo' CHECK (kind IN ('promo','glow_redemption','referral_welcome')),
  ADD COLUMN IF NOT EXISTS first_order_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_ledger_id uuid REFERENCES public.glow_credit_transactions(id);

-- 7. Reviews: link to a customer so approval can award credits idempotently -------------
ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS credit_awarded boolean NOT NULL DEFAULT false;

-- 8. Retire the old flat-counter trigger — the Node engine now owns all crediting --------
DROP TRIGGER IF EXISTS on_order_payment_status_change ON public.orders;
DROP FUNCTION IF EXISTS public.handle_order_points();

-- 9. Nightly batch functions (expiry sweep, birthday awards, VIP period generation) ------
CREATE OR REPLACE FUNCTION public.glow_expire_due_credits()
RETURNS void AS $$
BEGIN
  INSERT INTO public.glow_credit_transactions (customer_id, type, amount, order_id, reference_id, note, expires_at, created_at)
  SELECT customer_id, 'expire', -remaining, NULL, id, 'Automatic expiry sweep', NULL, now()
  FROM public.glow_credit_transactions
  WHERE type LIKE 'earn_%' AND remaining > 0 AND expires_at IS NOT NULL AND expires_at <= now();

  UPDATE public.glow_credit_transactions
  SET remaining = 0
  WHERE type LIKE 'earn_%' AND remaining > 0 AND expires_at IS NOT NULL AND expires_at <= now();

  UPDATE public.customers c
  SET loyalty_points_balance = sub.balance,
      lifetime_earned_points = sub.lifetime
  FROM (
    SELECT customer_id,
           COALESCE(SUM(remaining) FILTER (WHERE type LIKE 'earn_%' AND (expires_at IS NULL OR expires_at > now())), 0) AS balance,
           COALESCE(SUM(amount) FILTER (WHERE type LIKE 'earn_%'), 0) AS lifetime
    FROM public.glow_credit_transactions
    GROUP BY customer_id
  ) sub
  WHERE c.id = sub.customer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.glow_award_birthday_credits()
RETURNS void AS $$
DECLARE
  policy jsonb;
  credit_amount numeric;
  expiry_months int;
  cust RECORD;
BEGIN
  SELECT value INTO policy FROM public.store_settings WHERE key = 'glow_rewards_policy';
  credit_amount := COALESCE((policy->>'birthdayCredits')::numeric, 100);
  expiry_months := COALESCE((policy->>'expirationMonths')::int, 6);

  FOR cust IN
    SELECT id FROM public.customers
    WHERE date_of_birth IS NOT NULL
      AND extract(month FROM date_of_birth) = extract(month FROM CURRENT_DATE)
      AND extract(day FROM date_of_birth) = extract(day FROM CURRENT_DATE)
      AND COALESCE(last_birthday_award_year, 0) <> extract(year FROM CURRENT_DATE)::int
  LOOP
    INSERT INTO public.glow_credit_transactions (customer_id, type, amount, remaining, expires_at, note, created_at)
    VALUES (cust.id, 'earn_birthday', credit_amount, credit_amount, now() + (expiry_months || ' months')::interval, 'Birthday reward', now());

    UPDATE public.customers SET last_birthday_award_year = extract(year FROM CURRENT_DATE)::int WHERE id = cust.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.glow_generate_vip_rewards_if_due()
RETURNS void AS $$
DECLARE
  policy jsonb;
  thresholds numeric[];
  top_threshold numeric;
  period text;
BEGIN
  IF NOT (
    (extract(month FROM CURRENT_DATE) = 1 AND extract(day FROM CURRENT_DATE) = 1) OR
    (extract(month FROM CURRENT_DATE) = 7 AND extract(day FROM CURRENT_DATE) = 1)
  ) THEN
    RETURN;
  END IF;

  SELECT value INTO policy FROM public.store_settings WHERE key = 'glow_rewards_policy';
  IF NOT COALESCE((policy->>'vipRewardEnabled')::boolean, true) THEN
    RETURN;
  END IF;

  SELECT ARRAY(
    SELECT jsonb_array_elements_text(COALESCE(policy->'tierThresholdsJmd', '[0,10000,25000]'::jsonb))::numeric
  ) INTO thresholds;
  top_threshold := thresholds[array_upper(thresholds, 1)];
  period := extract(year FROM CURRENT_DATE)::text || '-H' || (CASE WHEN extract(month FROM CURRENT_DATE) = 1 THEN '1' ELSE '2' END);

  INSERT INTO public.glow_vip_product_rewards (customer_id, period_label, status)
  SELECT id, period, 'pending' FROM public.customers WHERE COALESCE(lifetime_purchase_jmd, 0) >= top_threshold
  ON CONFLICT (customer_id, period_label) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.glow_run_daily_jobs()
RETURNS void AS $$
BEGIN
  PERFORM public.glow_expire_due_credits();
  PERFORM public.glow_award_birthday_credits();
  PERFORM public.glow_generate_vip_rewards_if_due();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
