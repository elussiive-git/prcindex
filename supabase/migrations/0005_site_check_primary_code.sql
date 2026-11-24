-- Проверка официального сайта кандидата, основной код Минцифры и пометки к логотипу (решения 24.11.2026).

-- site_status: ok — сайт открылся, ИНН на сайте совпадает; other_inn — на сайте другой ИНН (родственное юрлицо);
-- no_inn — открылся, ИНН не найден; unreachable — не открывается; cert_error — российский/недоверенный сертификат,
-- нужен ручной просмотр; domain_lost — домен занят посторонним сайтом.
alter table public.registry_companies
  add column if not exists site_status text,
  add column if not exists site_final_url text,
  add column if not exists site_note text,
  add column if not exists site_checked_at timestamptz,
  add column if not exists primary_code text references public.it_activity_codes(code),
  add column if not exists logo_flags text[] not null default '{}';
alter table public.registry_companies drop constraint if exists registry_site_status_chk;
alter table public.registry_companies add constraint registry_site_status_chk
  check (site_status is null or site_status in ('ok','other_inn','no_inn','unreachable','cert_error','domain_lost'));
create index if not exists registry_companies_site_status_idx on public.registry_companies(site_status);

-- Основной код: вид деятельности, который лучше всего описывает основной бизнес (по описанию на сайте),
-- выбирается только из кодов, указанных компанией. Сегмент = сегмент основного кода.
-- Все указанные коды остаются в it_codes.
-- logo_flags: inverted — версия для тёмного фона (цветной не нашлось); parent_brand — в связке с материнским брендом.
