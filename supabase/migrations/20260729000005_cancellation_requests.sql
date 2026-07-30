create table if not exists public.order_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_number text not null,
  customer_name text,
  customer_email text not null,
  customer_phone text,
  reason text not null,
  request_source text not null check (request_source in ('guest_email', 'customer_account')),
  requested_by_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists one_pending_cancellation_per_order
  on public.order_cancellation_requests (order_id)
  where status = 'pending';

create index if not exists cancellation_requests_status_created_idx
  on public.order_cancellation_requests (status, created_at desc);

alter table public.order_cancellation_requests enable row level security;

drop policy if exists "Admins can manage cancellation requests" on public.order_cancellation_requests;
create policy "Admins can manage cancellation requests"
  on public.order_cancellation_requests
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.order_cancellation_requests is
  'Customer cancellation requests that require an admin decision before an order status changes.';

-- Existing editable templates used wording from the former immediate-cancellation flow.
update public.email_templates
set
  name = 'Cancellation request received',
  description = 'Confirms that a cancellation request is waiting for store review.',
  subject_template = 'Cancellation request received - {{order_number}}',
  body_html = '<p>Hi {{customer_name}},</p><p>We received your request to cancel <strong>{{order_number}}</strong>.</p><p><strong>Your order has not been cancelled yet.</strong> Our team will review the request and email you with the decision.</p><p><strong>Reason submitted:</strong> {{cancellation_reason}}</p>{{{refund_message}}}<p>Contact us immediately if you did not make this request.</p>',
  updated_at = now()
where template_key = 'order_cancelled';

update public.email_templates
set
  name = 'Cancellation request alert',
  description = 'Alerts the store owner that a cancellation request needs review.',
  subject_template = 'Cancellation review needed - {{order_number}}',
  body_html = '<p>A customer cancellation request needs review for <strong>{{order_number}}</strong>.</p><p><strong>Customer:</strong> {{customer_name}} ({{customer_email}})<br><strong>Submitted from:</strong> {{request_source}}<br><strong>Reason:</strong> {{cancellation_reason}}<br><strong>Payment status:</strong> {{payment_status}}</p>{{{refund_action}}}<p><a href="{{admin_orders_url}}">Review this request in Admin Orders</a></p>',
  updated_at = now()
where template_key = 'owner_order_cancelled';

insert into public.email_templates (template_key, name, category, audience, description, subject_template, body_html)
values
  (
    'cancellation_request_approved',
    'Cancellation approved',
    'Orders',
    'Customer',
    'Sent after an admin approves a cancellation request.',
    'Cancellation approved - {{order_number}}',
    '<p>Hi {{customer_name}},</p><p>Your request to cancel <strong>{{order_number}}</strong> was approved. The order is now cancelled.</p>{{{refund_message}}}<p><strong>Store note:</strong> {{admin_note}}</p><p>Please contact us if you need any further help.</p>'
  ),
  (
    'cancellation_request_declined',
    'Cancellation not approved',
    'Orders',
    'Customer',
    'Sent after an admin declines a cancellation request.',
    'Update on your cancellation request - {{order_number}}',
    '<p>Hi {{customer_name}},</p><p>We reviewed your request to cancel <strong>{{order_number}}</strong>, but the cancellation could not be approved.</p><p><strong>Store note:</strong> {{admin_note}}</p><p>Your order remains active. Please contact us if you need help.</p>'
  )
on conflict (template_key) do nothing;

update public.email_templates
set body_html = case
  when body_html like '%We are preparing your order%' then
    replace(body_html, '<p>We are preparing your order now. You will receive another update when it is ready for pickup or dispatch.</p>', '<p>We are preparing your order now. You will receive another update when it is ready for pickup or dispatch.</p>{{{cancellation_action}}}')
  else body_html || chr(10) || '{{{cancellation_action}}}'
end,
updated_at = now()
where template_key = 'payment_confirmed'
  and body_html not like '%{{{cancellation_action}}}%';

notify pgrst, 'reload schema';
