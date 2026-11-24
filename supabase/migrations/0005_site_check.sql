-- Результат проверки официального сайта кандидата (при сборе логотипа и кодов Минцифры).
-- site_status: ok — открылся, ИНН на сайте совпадает; other_inn — на сайте другой ИНН;
-- no_inn — открылся, ИНН не найден; unreachable — не открывается; cert_error — ошибка сертификата;
-- domain_lost — домен занят посторонним сайтом.
alter table public.registry_companies
  add column if not exists site_status text,
  add column if not exists site_final_url text,
  add column if not exists site_note text,
  add column if not exists site_checked_at timestamptz;
alter table public.registry_companies drop constraint if exists registry_site_status_chk;
alter table public.registry_companies add constraint registry_site_status_chk
  check (site_status is null or site_status in ('ok','other_inn','no_inn','unreachable','cert_error','domain_lost'));
create index if not exists registry_companies_site_status_idx on public.registry_companies(site_status);
