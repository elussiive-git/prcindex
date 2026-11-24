-- Хранилище логотипов кандидатов и результат сканера цвета (методика цвета v2.1, браузерный перенос).
insert into storage.buckets (id, name, public) values ('candidate-logos','candidate-logos', false)
on conflict (id) do nothing;
drop policy if exists candidate_logos_read on storage.objects;
create policy candidate_logos_read on storage.objects for select using (bucket_id='candidate-logos' and active_profile());
drop policy if exists candidate_logos_owner on storage.objects;
create policy candidate_logos_owner on storage.objects for all using (bucket_id='candidate-logos' and is_owner()) with check (bucket_id='candidate-logos' and is_owner());

alter table public.registry_companies
  add column if not exists logo_storage_path text,   -- копия логотипа в хранилище candidate-logos
  add column if not exists logo_sha256 text,
  add column if not exists color_scan jsonb,         -- полный результат сканера (цвета, доли, фон, флаги)
  add column if not exists color_scanned_at timestamptz,
  add column if not exists color_scanner text;       -- версия сканера, напр. 2.1-ts
