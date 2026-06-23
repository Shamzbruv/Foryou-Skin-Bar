-- Separate product Results content from the short Best For summary.
-- Older admin builds saved the Results/Benefits editor into best_for_html,
-- which made the storefront render the same content as both Results and Best For.

alter table public.products add column if not exists results_html text;

update public.products
set results_html = best_for_html
where nullif(trim(coalesce(results_html, '')), '') is null
  and nullif(trim(coalesce(best_for_html, '')), '') is not null;

with legacy_results as (
  select
    product_id,
    string_agg(body, E'\n\n' order by sort_order, created_at) as body
  from public.product_info_sections
  where title ~* '^\\s*results\\b'
    and nullif(trim(coalesce(body, '')), '') is not null
  group by product_id
)
update public.products p
set results_html = concat_ws(E'\n\n', nullif(trim(coalesce(p.results_html, '')), ''), legacy_results.body)
from legacy_results
where p.id = legacy_results.product_id;

delete from public.product_info_sections
where title ~* '^\\s*results\\b';
