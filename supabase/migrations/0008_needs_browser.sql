-- Статус «нужен браузер»: сервер получил почти пустую страницу (сайт собирается скриптами в браузере).
alter table public.registry_companies drop constraint if exists registry_site_status_chk;
alter table public.registry_companies add constraint registry_site_status_chk
  check (site_status is null or site_status in ('ok','other_inn','no_inn','unreachable','cert_error','domain_lost','needs_browser'));
