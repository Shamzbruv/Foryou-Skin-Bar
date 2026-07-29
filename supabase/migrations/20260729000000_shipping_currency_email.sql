-- Region-aware shipping and customer payment currency.
alter table public.payment_checkout_sessions
  add column if not exists payment_currency text not null default 'JMD',
  add column if not exists payment_amount numeric(12,2),
  add column if not exists exchange_rate_jmd_per_usd numeric(12,4),
  add column if not exists customer_region text;

alter table public.orders
  add column if not exists payment_currency text not null default 'JMD',
  add column if not exists payment_amount numeric(12,2),
  add column if not exists exchange_rate_jmd_per_usd numeric(12,4),
  add column if not exists customer_region text;

update public.payment_checkout_sessions
set payment_amount = grand_total_jmd
where payment_amount is null;

update public.orders
set payment_amount = grand_total_jmd
where payment_amount is null;

insert into public.store_settings (key, value)
values (
  'shipping_rules',
  '{"domesticFreeThresholdJmd":10000,"internationalFreeThresholdJmd":20000,"internationalFlatRateUsd":37,"usdToJmdRate":160,"zipmailJmd":500,"knutsfordJmd":700,"bearerJmd":750,"internationalCarrier":"DHL","autoDetectLocation":true}'::jsonb
)
on conflict (key) do nothing;
