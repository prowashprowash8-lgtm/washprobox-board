-- RPC : garantit la laverie CRM + la ligne crm_laverie_links pour un emplacement board.
-- À exécuter une fois dans Supabase SQL Editor (même projet que le board).
-- Corrige le cas "Aucune laverie CRM liée à cet emplacement" sans passer par le backfill manuel.

create or replace function public.ensure_crm_link_for_emplacement(p_emplacement_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link text;
  v_new uuid;
  v_name text;
  v_address text;
  a text;
  cp text;
  v text;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;

  -- Compte "résidence" : uniquement les emplacements autorisés
  if exists (
    select 1 from public.board_account_roles
    where user_id = auth.uid() and role = 'residence'
  ) then
    if not exists (
      select 1 from public.board_account_emplacements
      where user_id = auth.uid() and emplacement_id = p_emplacement_id
    ) then
      raise exception 'Accès refusé à cet emplacement';
    end if;
  end if;

  select nullif(trim(crm_site_id), '') into v_link
  from public.crm_laverie_links
  where emplacement_id = p_emplacement_id;

  if v_link is not null then
    return v_link::uuid;
  end if;

  select e.name, e.address into v_name, v_address
  from public.emplacements e
  where e.id = p_emplacement_id;

  if not found then
    return null;
  end if;

  -- Insert minimal (sans latitude/longitude) : ne dépend pas de insert_crm_laverie_from_board.
  select adresse, code_postal, ville
    into a, cp, v
  from public.map_board_address_to_laverie_fields(coalesce(v_address, ''));

  insert into public.laveries (nom, adresse, code_postal, ville)
  values (
    coalesce(nullif(trim(v_name), ''), 'Sans nom'),
    a,
    cp,
    v
  )
  returning id into v_new;

  insert into public.crm_laverie_links (
    emplacement_id, crm_site_id, sync_status, synced_at, last_error, updated_at
  )
  values (
    p_emplacement_id, v_new::text, 'synced', now(), null, now()
  )
  on conflict (emplacement_id) do update set
    crm_site_id = excluded.crm_site_id,
    sync_status = 'synced',
    synced_at = now(),
    last_error = null,
    updated_at = now();

  return v_new;
end;
$$;

grant execute on function public.ensure_crm_link_for_emplacement(uuid) to authenticated;
