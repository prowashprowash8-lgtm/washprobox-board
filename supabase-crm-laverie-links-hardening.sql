-- Durcissement de la table de lien board<->CRM.
-- Compatible avec les versions existantes de crm_laverie_links.

alter table public.crm_laverie_links
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_payload jsonb,
  add column if not exists last_response jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Normalise les valeurs de sync_status avant contrainte.
update public.crm_laverie_links
set sync_status = case
  when sync_status in ('synced', 'pending', 'failed') then sync_status
  when coalesce(nullif(trim(crm_site_id), ''), '') <> '' then 'synced'
  else 'pending'
end;

alter table public.crm_laverie_links
  drop constraint if exists crm_laverie_links_sync_status_check;

alter table public.crm_laverie_links
  add constraint crm_laverie_links_sync_status_check
  check (sync_status in ('pending', 'synced', 'failed'));

create index if not exists idx_crm_laverie_links_sync_status
  on public.crm_laverie_links (sync_status);

create index if not exists idx_crm_laverie_links_updated_at
  on public.crm_laverie_links (updated_at desc);
