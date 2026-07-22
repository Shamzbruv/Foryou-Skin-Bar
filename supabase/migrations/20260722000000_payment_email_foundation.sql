-- Payment-aware email outbox and one-time blog publication notifications.
alter table public.email_logs
  add column if not exists subject text,
  add column if not exists html_body text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists scheduled_for timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_email_logs_pending_resend
  on public.email_logs (scheduled_for, created_at)
  where status in ('pending_resend_setup', 'scheduled');

alter table public.blog_posts
  add column if not exists newsletter_notified_at timestamptz;

create table if not exists public.payment_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  checkout_reference text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  customer_data jsonb not null,
  shipping_data jsonb not null,
  cart_data jsonb not null,
  subtotal_jmd numeric(12,2) not null,
  discount_code text,
  discount_total_jmd numeric(12,2) not null default 0,
  shipping_total_jmd numeric(12,2) not null default 0,
  grand_total_jmd numeric(12,2) not null,
  points_earned integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'expired', 'failed')),
  fygaro_transaction_id text,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_checkout_sessions_status_created
  on public.payment_checkout_sessions (status, created_at desc);

alter table public.payment_checkout_sessions enable row level security;

drop policy if exists "Admins can view checkout sessions" on public.payment_checkout_sessions;
create policy "Admins can view checkout sessions"
  on public.payment_checkout_sessions for select
  using (public.is_admin());

grant select on public.payment_checkout_sessions to authenticated;
grant all on public.payment_checkout_sessions to service_role;
