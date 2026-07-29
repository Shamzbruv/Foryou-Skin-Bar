-- Store one authoritative shipment-tracking record per order.
alter table public.orders
  add column if not exists tracking_carrier text,
  add column if not exists tracking_number text,
  add column if not exists tracking_url text,
  add column if not exists tracking_updated_at timestamptz;

comment on column public.orders.tracking_carrier is 'Courier name entered by an admin or a future carrier integration.';
comment on column public.orders.tracking_number is 'Carrier shipment reference shown to the customer.';
comment on column public.orders.tracking_url is 'Customer-facing HTTPS tracking page for this shipment.';
comment on column public.orders.tracking_updated_at is 'Last time the shipment tracking details changed.';

-- Existing installations already have this editable template row. Add the new
-- tracking block without replacing any other edits the store owner has made.
update public.email_templates
set body_html = case
  when body_html like '%{{{items_html}}}%' then
    replace(body_html, '{{{items_html}}}', '{{{tracking_details}}}' || chr(10) || '{{{items_html}}}')
  else body_html || chr(10) || '{{{tracking_details}}}'
end,
updated_at = now()
where template_key = 'shipping_update'
  and body_html not like '%{{{tracking_details}}}%';

notify pgrst, 'reload schema';
