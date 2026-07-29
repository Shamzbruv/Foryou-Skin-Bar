-- Add a separately managed bearer-delivery rate for Portmore.
insert into public.store_settings (key, value)
values (
  'shipping_rules',
  '{"domesticFreeThresholdJmd":10000,"internationalFreeThresholdJmd":20000,"internationalFlatRateUsd":37,"usdToJmdRate":160,"zipmailJmd":500,"knutsfordJmd":700,"bearerJmd":750,"bearerPortmoreJmd":950,"internationalCarrier":"DHL","autoDetectLocation":true}'::jsonb
)
on conflict (key) do update
set value = case
  when coalesce(public.store_settings.value, '{}'::jsonb) ? 'bearerPortmoreJmd'
    then public.store_settings.value
  else coalesce(public.store_settings.value, '{}'::jsonb) || '{"bearerPortmoreJmd":950}'::jsonb
end;
