-- Keep editable and queued email links on the public storefront domain.
update public.email_templates
set
  subject_template = replace(
    replace(subject_template, 'https://foryou-skin-bar-production.up.railway.app', 'https://foryouskinbar.com'),
    'https://www.foryouskinbar.com',
    'https://foryouskinbar.com'
  ),
  body_html = replace(
    replace(body_html, 'https://foryou-skin-bar-production.up.railway.app', 'https://foryouskinbar.com'),
    'https://www.foryouskinbar.com',
    'https://foryouskinbar.com'
  ),
  updated_at = now()
where subject_template like '%foryou-skin-bar-production.up.railway.app%'
   or body_html like '%foryou-skin-bar-production.up.railway.app%'
   or subject_template like '%https://www.foryouskinbar.com%'
   or body_html like '%https://www.foryouskinbar.com%';

update public.email_logs
set
  subject = replace(
    replace(subject, 'https://foryou-skin-bar-production.up.railway.app', 'https://foryouskinbar.com'),
    'https://www.foryouskinbar.com',
    'https://foryouskinbar.com'
  ),
  html_body = replace(
    replace(html_body, 'https://foryou-skin-bar-production.up.railway.app', 'https://foryouskinbar.com'),
    'https://www.foryouskinbar.com',
    'https://foryouskinbar.com'
  ),
  updated_at = now()
where status in ('queued', 'scheduled', 'pending_resend_setup')
  and (
    subject like '%foryou-skin-bar-production.up.railway.app%'
    or html_body like '%foryou-skin-bar-production.up.railway.app%'
    or subject like '%https://www.foryouskinbar.com%'
    or html_body like '%https://www.foryouskinbar.com%'
  );

notify pgrst, 'reload schema';
