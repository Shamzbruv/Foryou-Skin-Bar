-- Editable email content used by the Resend delivery pipeline.
create table if not exists public.email_templates (
  template_key text primary key check (template_key ~ '^[a-z0-9_]+$'),
  name text not null,
  category text not null,
  audience text not null,
  description text not null default '',
  subject_template text not null,
  body_html text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_email_template_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists email_templates_set_updated_at on public.email_templates;
create trigger email_templates_set_updated_at
before update on public.email_templates
for each row execute function public.set_email_template_updated_at();

alter table public.email_templates enable row level security;

drop policy if exists "Admins can manage email templates" on public.email_templates;
create policy "Admins can manage email templates"
on public.email_templates
for all
using (public.is_admin())
with check (public.is_admin());
