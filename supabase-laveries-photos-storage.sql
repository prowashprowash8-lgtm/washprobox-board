-- Active le stockage photos pour les fiches laveries CRM/Board.
-- A executer dans Supabase SQL Editor.

-- 1) Bucket
insert into storage.buckets (id, name, public)
values ('laveries-photos', 'laveries-photos', true)
on conflict (id) do update
set public = true;

-- 2) Policies (lecture + upload + suppression pour utilisateurs connectes)
-- Remarque: policies sur storage.objects, filtre bucket_id.

drop policy if exists "laveries photos read public" on storage.objects;
create policy "laveries photos read public"
on storage.objects
for select
to public
using (bucket_id = 'laveries-photos');

drop policy if exists "laveries photos upload auth" on storage.objects;
create policy "laveries photos upload auth"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'laveries-photos');

drop policy if exists "laveries photos update auth" on storage.objects;
create policy "laveries photos update auth"
on storage.objects
for update
to authenticated
using (bucket_id = 'laveries-photos')
with check (bucket_id = 'laveries-photos');

drop policy if exists "laveries photos delete auth" on storage.objects;
create policy "laveries photos delete auth"
on storage.objects
for delete
to authenticated
using (bucket_id = 'laveries-photos');
