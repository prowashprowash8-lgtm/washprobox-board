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

-- Insertion CRM compatible (schéma minimal ou complet de public.laveries)
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
  has_adresse boolean;
  has_code_postal boolean;
  has_ville boolean;
  has_telephone boolean;
  has_email boolean;
  has_latitude boolean;
  has_longitude boolean;
  emp_has_latitude boolean;
  emp_has_longitude boolean;
  emp_latitude double precision;
  emp_longitude double precision;
  cols text := 'nom';
  vals text := format('%L', coalesce(nullif(trim(p_nom), ''), 'Sans nom'));
  sql text;
  new_id uuid;
begin
  select adresse, code_postal, ville
    into a, cp, v
  from public.map_board_address_to_laverie_fields(p_address);

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'adresse'
  ) into has_adresse;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'code_postal'
  ) into has_code_postal;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'ville'
  ) into has_ville;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'telephone'
  ) into has_telephone;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'email'
  ) into has_email;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'latitude'
  ) into has_latitude;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'longitude'
  ) into has_longitude;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'emplacements' and column_name = 'latitude'
  ) into emp_has_latitude;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'emplacements' and column_name = 'longitude'
  ) into emp_has_longitude;

  if emp_has_latitude or emp_has_longitude then
    execute
      'select ' ||
      case when emp_has_latitude then 'latitude' else 'null::double precision' end ||
      ', ' ||
      case when emp_has_longitude then 'longitude' else 'null::double precision' end ||
      ' from public.emplacements where id = $1'
      into emp_latitude, emp_longitude
      using p_emplacement_id;
  end if;

  if has_adresse then
    cols := cols || ', adresse';
    vals := vals || format(', %L', a);
  end if;
  if has_code_postal then
    cols := cols || ', code_postal';
    vals := vals || format(', %L', cp);
  end if;
  if has_ville then
    cols := cols || ', ville';
    vals := vals || format(', %L', v);
  end if;
  if has_telephone then
    cols := cols || ', telephone';
    vals := vals || ', null';
  end if;
  if has_email then
    cols := cols || ', email';
    vals := vals || ', null';
  end if;
  if has_latitude then
    cols := cols || ', latitude';
    if emp_latitude is not null then
      vals := vals || format(', %L', emp_latitude);
    else
      vals := vals || ', null';
    end if;
  end if;
  if has_longitude then
    cols := cols || ', longitude';
    if emp_longitude is not null then
      vals := vals || format(', %L', emp_longitude);
    else
      vals := vals || ', null';
    end if;
  end if;

  sql := format('insert into public.laveries (%s) values (%s) returning id', cols, vals);
  execute sql into new_id;
  return new_id;
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
  new_id uuid;
  existing_link record;
begin
  select *
    into existing_link
  from public.crm_laverie_links l
  where l.emplacement_id = new.id;

  if existing_link is not null and coalesce(nullif(trim(existing_link.crm_site_id), ''), '') <> '' then
    return new;
  end if;

  new_id := public.insert_crm_laverie_from_board(new.id, new.name, new.address);

  if existing_link is null then
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
  else
    update public.crm_laverie_links
    set
      crm_site_id = new_id::text,
      sync_status = 'synced',
      synced_at = now(),
      last_error = null
    where emplacement_id = new.id;
  end if;

  return new;
exception
  when others then
    if new_id is not null then
      delete from public.laveries where id = new_id;
    end if;
    update public.crm_laverie_links as l
    set
      sync_status = 'failed',
      last_error = sqlerrm,
      attempt_count = coalesce(l.attempt_count, 0) + 1,
      updated_at = now()
    where l.emplacement_id = new.id;
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

-- 3) Après suppression emplacement : suppression laverie CRM liée + lien
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
exception
  when others then
    raise warning 'emplacement→CRM delete sync échouée pour % : %', old.id, sqlerrm;
    return old;
end;
$$;

drop trigger if exists trg_emplacement_delete_sync_crm on public.emplacements;

create trigger trg_emplacement_delete_sync_crm
  before delete on public.emplacements
  for each row
  execute function public.trg_emplacement_delete_sync_crm();

comment on function public.trg_emplacement_delete_sync_crm() is
  'Supprime la laverie CRM liée + crm_laverie_links quand un emplacement board est supprimé.';

-- 4) Après modification emplacement : met à jour la laverie CRM liée
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
  has_nom boolean;
  has_adresse boolean;
  has_code_postal boolean;
  has_ville boolean;
  has_latitude boolean;
  has_longitude boolean;
  has_updated_at boolean;
  set_parts text[] := array[]::text[];
  sql text;
begin
  -- Rien à faire si les champs board-owned n'ont pas changé.
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

  -- Si aucun lien CRM, on crée d'abord la laverie + le lien.
  if crm_id is null then
    crm_id := public.insert_crm_laverie_from_board(new.id, new.name, new.address);
    insert into public.crm_laverie_links (
      emplacement_id,
      crm_site_id,
      sync_status,
      synced_at,
      last_error,
      updated_at
    )
    values (
      new.id,
      crm_id::text,
      'synced',
      now(),
      null,
      now()
    )
    on conflict (emplacement_id)
    do update set
      crm_site_id = excluded.crm_site_id,
      sync_status = 'synced',
      synced_at = now(),
      last_error = null,
      updated_at = now();
    return new;
  end if;

  select adresse, code_postal, ville
    into a, cp, v
  from public.map_board_address_to_laverie_fields(new.address);

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'nom'
  ) into has_nom;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'adresse'
  ) into has_adresse;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'code_postal'
  ) into has_code_postal;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'ville'
  ) into has_ville;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'latitude'
  ) into has_latitude;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'longitude'
  ) into has_longitude;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'laveries' and column_name = 'updated_at'
  ) into has_updated_at;

  if has_nom then
    set_parts := array_append(set_parts, format('nom = %L', coalesce(nullif(trim(new.name), ''), 'Sans nom')));
  end if;
  if has_adresse then
    set_parts := array_append(set_parts, format('adresse = %L', a));
  end if;
  if has_code_postal then
    set_parts := array_append(set_parts, format('code_postal = %L', cp));
  end if;
  if has_ville then
    set_parts := array_append(set_parts, format('ville = %L', v));
  end if;
  if has_latitude then
    if new.latitude is null then
      set_parts := array_append(set_parts, 'latitude = null');
    else
      set_parts := array_append(set_parts, format('latitude = %L', new.latitude));
    end if;
  end if;
  if has_longitude then
    if new.longitude is null then
      set_parts := array_append(set_parts, 'longitude = null');
    else
      set_parts := array_append(set_parts, format('longitude = %L', new.longitude));
    end if;
  end if;
  if has_updated_at then
    set_parts := array_append(set_parts, 'updated_at = now()');
  end if;

  if coalesce(array_length(set_parts, 1), 0) > 0 then
    sql := format('update public.laveries set %s where id = %L::uuid', array_to_string(set_parts, ', '), crm_id::text);
    execute sql;
  end if;

  update public.crm_laverie_links l
  set
    sync_status = 'synced',
    synced_at = now(),
    last_error = null,
    updated_at = now()
  where l.emplacement_id = new.id;

  return new;
exception
  when others then
    update public.crm_laverie_links l
    set
      sync_status = 'failed',
      last_error = sqlerrm,
      attempt_count = coalesce(l.attempt_count, 0) + 1,
      updated_at = now()
    where l.emplacement_id = new.id;
    raise warning 'emplacement→CRM update sync échouée pour % : %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_emplacement_update_sync_crm on public.emplacements;

create trigger trg_emplacement_update_sync_crm
  after update on public.emplacements
  for each row
  execute function public.trg_emplacement_update_sync_crm();

comment on function public.trg_emplacement_update_sync_crm() is
  'Met à jour la laverie CRM liée quand un emplacement board est modifié.';

-- Les emplacements créés AVANT ce trigger ne sont pas synchronisés : exécute une fois
-- supabase-emplacement-crm-backfill.sql puis SELECT * FROM public.backfill_emplacements_to_crm();
