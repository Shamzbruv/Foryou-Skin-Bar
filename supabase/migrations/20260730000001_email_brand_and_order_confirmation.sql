-- Keep customized email content while correcting the business name everywhere.
update public.email_templates
set
  name = case
    when template_key = 'payment_confirmed' then 'Order confirmation'
    else name
  end,
  description = case
    when template_key = 'payment_confirmed' then 'Sent to the customer as their order confirmation after Fygaro payment is successfully matched.'
    else description
  end,
  subject_template = case
    when template_key = 'payment_confirmed'
      and subject_template in (
        'Payment confirmed - For You Skin Bar order {{order_number}}',
        'Payment confirmed - Foryou Skin Bar order {{order_number}}'
      )
      then 'Order confirmed - Foryou Skin Bar order {{order_number}}'
    else replace(subject_template, 'For You Skin Bar', 'Foryou Skin Bar')
  end,
  body_html = replace(body_html, 'For You Skin Bar', 'Foryou Skin Bar'),
  updated_at = now();

notify pgrst, 'reload schema';
