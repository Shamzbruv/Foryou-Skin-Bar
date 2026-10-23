begin;
-- All test records and changes are rolled back; no emails or customer orders are touched.
do $$
declare a uuid; c uuid; o uuid; result jsonb; ref text := 'FSB-20990101-9999';
begin
  select id into a from public.profiles where role in ('owner','admin') and is_active is true limit 1;
  if a is null then raise exception 'No active admin available for verification'; end if;
  insert into public.customers(full_name,email) values ('Cancellation rollback test','rollback@example.invalid') returning id into c;
  insert into public.payment_checkout_sessions(checkout_reference,customer_id,customer_data,shipping_data,cart_data,subtotal_jmd,grand_total_jmd)
    values(ref,c,'{"fullName":"Rollback test","email":"rollback@example.invalid"}','{}','[]',100,100);
  result := public.admin_cancel_unpaid_sale('checkout',ref,'Payment not received',a);
  if not (result->>'changed')::boolean then raise exception 'Checkout not cancelled'; end if;
  result := public.admin_cancel_unpaid_sale('checkout',ref,'Payment not received',a);
  if (result->>'changed')::boolean then raise exception 'Duplicate was not idempotent'; end if;
  -- Simulate late payment materialization; cancellation must remain visible.
  insert into public.orders(order_number,customer_id,subtotal_jmd,grand_total_jmd,payment_status)
    values(ref,c,100,100,'unpaid') returning id into o;
  if (select status from public.orders where id=o) <> 'cancelled' then raise exception 'Late materialization reactivated checkout'; end if;
  update public.orders set payment_status='paid',status='confirmed' where id=o;
  if (select status from public.orders where id=o) <> 'cancelled' then raise exception 'Late payment reactivated order'; end if;
  insert into public.orders(order_number,customer_id,subtotal_jmd,grand_total_jmd,payment_status)
    values('FSB-20990101-9998',c,100,100,'unpaid') returning id into o;
  result := public.admin_cancel_unpaid_sale('order',o::text,'Payment not received',a);
  if not (result->>'changed')::boolean or not exists(select 1 from public.order_status_history where order_id=o and new_status='cancelled') then
    raise exception 'Order cancellation or audit failed'; end if;
  insert into public.orders(order_number,customer_id,subtotal_jmd,grand_total_jmd,payment_status)
    values('FSB-20990101-9997',c,100,100,'paid') returning id into o;
  begin
    perform public.admin_cancel_unpaid_sale('order',o::text,'Payment not received',a);
    raise exception 'TEST FAILURE: paid order accepted';
  exception when raise_exception then
    if SQLERRM like 'TEST FAILURE:%' then raise; end if;
  end;
  if has_function_privilege('anon','public.admin_cancel_unpaid_sale(text,text,text,uuid)','EXECUTE') or has_function_privilege('authenticated','public.admin_cancel_unpaid_sale(text,text,text,uuid)','EXECUTE') then
    raise exception 'Cancellation RPC is not server-only';
  end if;
end $$;
select 'PASS: checkout/order cancellation, audit, duplicate calls, paid rejection, late payments, server-only RPC' as verification;
rollback;
