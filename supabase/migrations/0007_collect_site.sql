-- Автоматический сбор с официального сайта (функция collect-site): описание сайта и пометка,
-- что основной код предложен автоматически и ждёт подтверждения.
alter table public.registry_companies
  add column if not exists site_description text,
  add column if not exists primary_code_auto boolean not null default false,
  add column if not exists collect_log jsonb;
