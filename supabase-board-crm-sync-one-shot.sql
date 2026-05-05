-- ONE SHOT: Sync board emplacements -> CRM laveries
-- A executer UNE FOIS dans Supabase SQL Editor (projet board+crm).
-- Objectif: quand un emplacement board est cree/modifie/supprime,
-- la laverie CRM correspondante est geree automatiquement sans erreur RLS.

begin;

-- 0) Table de liaison board <-> CRM
create table if not exists public.crm_laverie_links (
  emplacement_id uuid primary key references public.emplacements (id) on delete cascade,
  crm_site_id text,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'failed')),
  synced_at timestamptz,
  last_error text,
  attempt_count integer not null default 0,
  last_payload jsonb,
  last_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_laverie_links_sync_status on public.crm_laverie_links (sync_status);
create index if not exists idx_crm_laverie_links_updated_at on public.crm_laverie_links (updated_at desc);

-- 1) Mapping adresse board -> champs CRM
create or replace function public.map_board_address_to_laverie_fields(
  addr text,
  out adresse text,
  out code_postal text,
  out ville text
)
language plpgsql
immutable
set search_path = public
as $$
declare
  raw text := trim(coalesce(addr, ''));
  cp text;
  idx int;
begin
  if raw = '' then
    adresse := 'Adresse non renseignee';
    code_postal := '00000';
    ville := 'Non renseignee';
    return;
  end if;

  cp := (regexp_match(raw, '(\d{5})'))[1];
  if cp is null then
    adresse := raw;
    code_postal := '00000';
    ville := 'Non renseignee';
    return;
  end if;

  idx := position(cp in raw);
  adresse := trim(both ' ,' from substring(raw from 1 for idx - 1));
  if adresse = '' then
    adresse := raw;
  end if;
  code_postal := cp;
  ville := trim(both ' ,' from substring(raw from idx + 5));
  if ville = '' then
    ville := 'Non renseignee';
  end if;
end;
$$;

-- 2) Insert CRM robuste (security definer => bypass RLS pour la sync)
create or replace function public.insert_crm_laverie_from_board(
  p_emplacement_id uuid,
  p_nom text,
  p_address text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a text;
  cp text;
  v text;
  new_id uuid;
begin
  select adresse, code_postal, ville
    into a, cp, v
  from public.map_board_address_to_laverie_fields(p_address);

  insert into public.laveries (
    nom, adresse, code_postal, ville, latitude, longitude
  )
  select
    coalesce(nullif(trim(p_nom), ''), 'Sans nom'),
    a,
    cp,
    v,
    e.latitude,
    e.longitude
  from public.emplacements e
  where e.id = p_emplacement_id
  returning id into new_id;

  if new_id is null then
    insert into public.laveries (nom, adresse, code_postal, ville)
    values (coalesce(nullif(trim(p_nom), ''), 'Sans nom'), a, cp, v)
    returning id into new_id;
  end if;

  return new_id;
end;
$$;

-- 3) Trigger INSERT: emplacement -> laverie CRM + lien
create or replace function public.trg_emplacement_insert_sync_crm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  new_id := public.insert_crm_laverie_from_board(new.id, new.name, new.address);

  insert into public.crm_laverie_links (
    emplacement_id, crm_site_id, sync_status, synced_at, last_error, updated_at
  )
  values (
    new.id, new_id::text, 'synced', now(), null, now()
  )
  on conflict (emplacement_id)
  do update set
    crm_site_id = excluded.crm_site_id,
    sync_status = 'synced',
    synced_at = now(),
    last_error = null,
    updated_at = now();

  return new;
exception
  when others then
    update public.crm_laverie_links as l
    set
      sync_status = 'failed',
      last_error = sqlerrm,
      attempt_count = coalesce(l.attempt_count, 0) + 1,
      updated_at = now()
    where l.emplacement_id = new.id;
    return new;
end;
$$;

drop trigger if exists trg_emplacement_insert_sync_crm on public.emplacements;
create trigger trg_emplacement_insert_sync_crm
after insert on public.emplacements
for each row
execute function public.trg_emplacement_insert_sync_crm();

-- 4) Trigger UPDATE: met a jour la laverie CRM liee
create or replace function public.trg_emplacement_update_sync_crm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  crm_id uuid;
  a text;
  cp text;
  v text;
begin
  if coalesce(new.name, '') = coalesce(old.name, '')
     and coalesce(new.address, '') = coalesce(old.address, '')
     and coalesce(new.latitude, 0) = coalesce(old.latitude, 0)
     and coalesce(new.longitude, 0) = coalesce(old.longitude, 0) then
    return new;
  end if;

  select nullif(trim(l.crm_site_id), '')::uuid
    into crm_id
  from public.crm_laverie_links l
  where l.emplacement_id = new.id;

  if crm_id is null then
    perform public.trg_emplacement_insert_sync_crm();
    return new;
  end if;

  select adresse, code_postal, ville
    into a, cp, v
  from public.map_board_address_to_laverie_fields(new.address);

  update public.laveries
  set
    nom = coalesce(nullif(trim(new.name), ''), 'Sans nom'),
    adresse = a,
    code_postal = cp,
    ville = v,
    latitude = new.latitude,
    longitude = new.longitude
  where id = crm_id;

  update public.crm_laverie_links
  set sync_status = 'synced', synced_at = now(), last_error = null, updated_at = now()
  where emplacement_id = new.id;

  return new;
exception
  when others then
    update public.crm_laverie_links as l
    set
      sync_status = 'failed',
      last_error = sqlerrm,
      attempt_count = coalesce(l.attempt_count, 0) + 1,
      updated_at = now()
    where l.emplacement_id = new.id;
    return new;
end;
$$;

drop trigger if exists trg_emplacement_update_sync_crm on public.emplacements;
create trigger trg_emplacement_update_sync_crm
after update on public.emplacements
for each row
execute function public.trg_emplacement_update_sync_crm();

-- 5) Trigger DELETE: supprime la laverie CRM liee
create or replace function public.trg_emplacement_delete_sync_crm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  crm_id uuid;
begin
  select nullif(trim(l.crm_site_id), '')::uuid
    into crm_id
  from public.crm_laverie_links l
  where l.emplacement_id = old.id;

  if crm_id is not null then
    delete from public.laveries where id = crm_id;
  end if;

  delete from public.crm_laverie_links where emplacement_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_emplacement_delete_sync_crm on public.emplacements;
create trigger trg_emplacement_delete_sync_crm
before delete on public.emplacements
for each row
execute function public.trg_emplacement_delete_sync_crm();

-- 6) Backfill manuel via RPC (appele par le bouton "Importer depuis Board")
create or replace function public.backfill_emplacements_to_crm()
returns table(emplacement_id uuid, laverie_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  new_id uuid;
begin
  for r in
    select e.id as eid, e.name, e.address, l.crm_site_id
    from public.emplacements e
    left join public.crm_laverie_links l on l.emplacement_id = e.id
    where l.emplacement_id is null
       or coalesce(nullif(trim(l.crm_site_id), ''), '') = ''
  loop
    new_id := null;
    begin
      new_id := public.insert_crm_laverie_from_board(r.eid, r.name, r.address);
      insert into public.crm_laverie_links (
        emplacement_id, crm_site_id, sync_status, synced_at, last_error, updated_at
      )
      values (
        r.eid, new_id::text, 'synced', now(), null, now()
      )
      on conflict (emplacement_id)
      do update set
        crm_site_id = excluded.crm_site_id,
        sync_status = 'synced',
        synced_at = now(),
        last_error = null,
        updated_at = now();

      emplacement_id := r.eid;
      laverie_id := new_id;
      status := 'ok';
      return next;
    exception
      when others then
        emplacement_id := r.eid;
        laverie_id := null;
        status := sqlerrm;
        return next;
    end;
  end loop;
end;
$$;

-- 6b) Resync FORCE: reimporte tous les emplacements board, meme deja lies.
-- Supprime uniquement les laveries CRM creees via crm_laverie_links, puis les recree.
create or replace function public.force_resync_all_emplacements_to_crm()
returns table(emplacement_id uuid, laverie_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  new_id uuid;
begin
  -- Supprime les laveries CRM actuellement liees aux emplacements.
  delete from public.laveries lv
  using public.crm_laverie_links l
  where nullif(trim(l.crm_site_id), '')::uuid = lv.id;

  -- Repart proprement.
  delete from public.crm_laverie_links;

  for r in
    select e.id as eid, e.name, e.address
    from public.emplacements e
    order by e.created_at asc
  loop
    begin
      new_id := public.insert_crm_laverie_from_board(r.eid, r.name, r.address);

      insert into public.crm_laverie_links (
        emplacement_id, crm_site_id, sync_status, synced_at, last_error, updated_at
      )
      values (
        r.eid, new_id::text, 'synced', now(), null, now()
      );

      emplacement_id := r.eid;
      laverie_id := new_id;
      status := 'ok';
      return next;
    exception
      when others then
        emplacement_id := r.eid;
        laverie_id := null;
        status := sqlerrm;
        return next;
    end;
  end loop;
end;
$$;

-- 7) Permissions RPC (sinon bouton import bloque)
grant execute on function public.backfill_emplacements_to_crm() to anon, authenticated;
grant execute on function public.force_resync_all_emplacements_to_crm() to anon, authenticated;

commit;

-- Verification rapide (optionnel):
-- select * from public.backfill_emplacements_to_crm();
-- select * from public.force_resync_all_emplacements_to_crm();
-- select * from public.crm_laverie_links order by updated_at desc limit 50;
