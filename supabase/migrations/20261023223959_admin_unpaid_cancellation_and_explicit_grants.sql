-- Keep unpaid cancellations visible and auditable, including saved Fygaro checkouts.
alter table public.payment_checkout_sessions
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancellation_reason text;

create or replace function public.admin_cancel_unpaid_sale(
  p_kind text, p_reference text, p_reason text, p_admin_id uuid
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  sale public.orders%rowtype;
  checkout public.payment_checkout_sessions%rowtype;
  customer public.customers%rowtype;
  stamp timestamptz := now();
  reason text := btrim(p_reason);
begin
  if not exists (select 1 from public.profiles where id=p_admin_id and is_active is true and role in ('owner','admin','staff')) then
    raise exception 'An active admin is required.' using errcode='42501';
  end if;
  if p_kind not in ('order','checkout') or reason is null or char_length(reason) not between 3 and 500 then
    raise exception 'Enter a cancellation reason (3–500 characters).';
  end if;
  if p_kind='checkout' then
    select * into checkout from public.payment_checkout_sessions where checkout_reference=p_reference for update;
    if not found then raise exception 'Checkout not found.' using errcode='P0002'; end if;
    if checkout.order_id is not null or checkout.status='paid' or checkout.fygaro_transaction_id is not null then
      raise exception 'A paid or order-linked checkout cannot be cancelled here.';
    end if;
    if checkout.status='cancelled' then return jsonb_build_object('changed',false); end if;
    if checkout.status not in ('pending','failed','expired') then raise exception 'This checkout cannot be cancelled.'; end if;
    if exists(select 1 from public.orders where order_number=checkout.checkout_reference) then
      raise exception 'This checkout has an order. Refresh and cancel the order instead.';
    end if;
    update public.payment_checkout_sessions set status='cancelled', cancelled_at=stamp,
      cancelled_by=p_admin_id, cancellation_reason=reason, updated_at=stamp where id=checkout.id;
    select * into customer from public.customers where id=checkout.customer_id;
    return jsonb_build_object('changed',true,'order_id',null,'reference',checkout.checkout_reference,
      'customer_name',coalesce(checkout.customer_data->>'fullName',customer.full_name),
      'customer_email',coalesce(nullif(checkout.customer_data->>'email',''),customer.email));
  end if;
  select * into sale from public.orders where id::text=p_reference for update;
  if not found then raise exception 'Order not found.' using errcode='P0002'; end if;
  if sale.status='cancelled' then return jsonb_build_object('changed',false); end if;
  if coalesce(sale.payment_status,'') not in ('unpaid','awaiting_confirmation')
     or sale.status in ('shipped','delivered','refunded')
     or sale.fulfillment_status in ('shipped','delivered','picked_up') then
    raise exception 'Only unpaid, unfulfilled orders can be cancelled here. Review any payment or refund separately.';
  end if;
  update public.orders set status='cancelled', updated_at=stamp,
    admin_notes=concat('[Admin cancellation ',stamp,'] ',reason,E'\n\n',coalesce(admin_notes,'')) where id=sale.id;
  insert into public.order_status_history(order_id,old_status,new_status,changed_by,note)
    values(sale.id,sale.status,'cancelled',p_admin_id,reason);
  select * into customer from public.customers where id=sale.customer_id;
  return jsonb_build_object('changed',true,'order_id',sale.id,'reference',sale.order_number,
    'customer_name',customer.full_name,'customer_email',customer.email);
end;
$$;
revoke all on function public.admin_cancel_unpaid_sale(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.admin_cancel_unpaid_sale(text,text,text,uuid) to service_role;

-- A signed late payment must be recorded without silently reactivating a cancellation.
-- Runs under the caller's privileges and never bypasses RLS.
create or replace function public.keep_cancelled_sale_on_payment()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare checkout_status text;
begin
  if TG_OP='INSERT' then
    if exists(select 1 from public.payment_checkout_sessions where checkout_reference=NEW.order_number) then
      select status into checkout_status from public.payment_checkout_sessions where checkout_reference=NEW.order_number for update;
    end if;
    if checkout_status='cancelled' then
      NEW.status := 'cancelled';
    end if;
  elsif OLD.status='cancelled' and NEW.payment_status='paid' and OLD.payment_status is distinct from NEW.payment_status then
    NEW.status := 'cancelled';
  end if;
  return NEW;
end;
$$;
revoke all on function public.keep_cancelled_sale_on_payment() from public, anon, authenticated;
drop trigger if exists keep_cancelled_sale_on_payment on public.orders;
create trigger keep_cancelled_sale_on_payment before insert or update on public.orders
for each row execute function public.keep_cancelled_sale_on_payment();

notify pgrst, 'reload schema';

