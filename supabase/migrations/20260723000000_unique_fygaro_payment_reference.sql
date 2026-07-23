-- Prevent one Fygaro payment from being reconciled to more than one checkout.
create unique index if not exists idx_payment_checkout_sessions_fygaro_transaction_unique
  on public.payment_checkout_sessions (fygaro_transaction_id)
  where fygaro_transaction_id is not null;
