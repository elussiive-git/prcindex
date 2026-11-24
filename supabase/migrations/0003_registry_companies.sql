-- Реестр аккредитованных ИТ-компаний Минцифры (срез 2026-11-03, DverkaSK/gosuslugi-itorgs).
-- Кандидаты для нового корпуса. Отдельно от основного корпуса 492 (companies / corpora).
-- Таблица и 19 104 строки загружены 2026-11-24 через SQL-редактор Supabase.

create table if not exists public.registry_companies (
  inn text primary key,
  ogrn text,
  registry_number text,
  name text not null,
  decision_date date,
  decision_number text,
  headcount integer,
  headcount_date date,
  website text,
  domain text,
  region_code text,
  logo_status text not null default 'needs_search',
  source_snapshot date not null,
  source_url text not null,
  created_at timestamptz not null default now()
);

-- Рабочие поля карточки кандидата (раньше жили в src/seed/*.json и localStorage)
alter table public.registry_companies
  add column if not exists brand text,
  add column if not exists segment text not null default 'Не определено',
  add column if not exists tags text[] not null default '{}',
  add column if not exists confidence text not null default 'Низкая',
  add column if not exists evidence text,
  add column if not exists evidence_url text,
  add column if not exists palette jsonb,
  add column if not exists palette_type text,
  add column if not exists logo_url text,
  add column if not exists logo_source_url text,
  add column if not exists classification_status text not null default 'needs',
  add column if not exists checked_at timestamptz,
  add column if not exists updated_at timestamptz;

-- logo_status: needs_search — логотипа нет; needs_check — найден автоматически, не подтверждён; ready — подтверждён
-- classification_status: needs — нужна классификация; ready — сегмент определён
alter table public.registry_companies drop constraint if exists registry_logo_status_chk;
alter table public.registry_companies add constraint registry_logo_status_chk check (logo_status in ('needs_search','needs_check','ready'));
alter table public.registry_companies drop constraint if exists registry_class_status_chk;
alter table public.registry_companies add constraint registry_class_status_chk check (classification_status in ('needs','ready'));

create index if not exists registry_companies_domain_idx on public.registry_companies(domain);
create index if not exists registry_companies_headcount_idx on public.registry_companies(headcount desc nulls last);
create index if not exists registry_companies_status_idx on public.registry_companies(logo_status);
create index if not exists registry_companies_class_idx on public.registry_companies(classification_status);

alter table public.registry_companies enable row level security;
drop policy if exists "registry read for signed-in" on public.registry_companies;
drop policy if exists registry_active_read on public.registry_companies;
drop policy if exists registry_owner_write on public.registry_companies;
create policy registry_active_read on public.registry_companies for select using (active_profile());
create policy registry_owner_write on public.registry_companies for update using (is_owner()) with check (is_owner());
