-- Synchro automatique board → CRM (même projet Supabase)
-- À exécuter dans SQL Editor sur le projet où existent EN MÊME TEMPS :
--   public.emplacements, public.laveries, public.crm_laverie_links
-- (voir aussi supabase-crm-laverie-links.sql côté CRM si la table liens n’existe pas encore.)
--
-- Si le board et le CRM sont sur DEUX projets Supabase distincts, ce script ne peut pas
-- insérer dans l’autre base : il faut un webhook Edge Function ou un appel API.

-- 1) Mapping adresse (équivalent à src/lib/boardLaverieMapping.ts du CRM)
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
    adresse := '—';
    code_postal := '00000';
    ville := 'À compléter';
    return;
  end if;

  cp := (regexp_match(raw, '(\d{5})'))[1];
  if cp is null then
    adresse := raw;
    code_postal := '00000';
    ville := 'À compléter';
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
    ville := 'À compléter';
  end if;
end;
$$;

-- 2) Après chaque nouvel emplacement : laverie CRM + ligne de lien
create or replace function public.trg_emplacement_insert_sync_crm()
returns trigger
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
  if exists (
    select 1 from public.crm_laverie_links l where l.emplacement_id = new.id
  ) then
    return new;
  end if;

  select adresse, code_postal, ville
    into a, cp, v
  from public.map_board_address_to_laverie_fields(new.address);

  insert into public.laveries (
    nom,
    adresse,
    code_postal,
    ville,
    telephone,
    email,
    latitude,
    longitude
  )
  values (
    new.name,
    a,
    cp,
    v,
    null,
    null,
    null,
    null
  )
  returning id into new_id;

  insert into public.crm_laverie_links (
    emplacement_id,
    crm_site_id,
    sync_status,
    synced_at,
    last_error
  )
  values (
    new.id,
    new_id::text,
    'synced',
    now(),
    null
  );

  return new;
exception
  when others then
    if new_id is not null then
      delete from public.laveries where id = new_id;
    end if;
    raise warning 'emplacement→CRM sync échouée pour % : %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_emplacement_insert_sync_crm on public.emplacements;

create trigger trg_emplacement_insert_sync_crm
  after insert on public.emplacements
  for each row
  execute function public.trg_emplacement_insert_sync_crm();

comment on function public.trg_emplacement_insert_sync_crm() is
  'Crée une ligne laveries + crm_laverie_links quand un emplacement est ajouté sur le board.';

-- Les emplacements créés AVANT ce trigger ne sont pas synchronisés : exécute une fois
-- supabase-emplacement-crm-backfill.sql puis SELECT * FROM public.backfill_emplacements_to_crm();
