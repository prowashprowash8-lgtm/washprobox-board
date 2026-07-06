-- Correctif : insert_crm_laverie_from_board sans colonnes latitude/longitude sur public.laveries
-- (erreur : column "latitude" of relation "laveries" does not exist)
-- Exécuter une fois dans Supabase SQL Editor.

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

  insert into public.laveries (nom, adresse, code_postal, ville)
  select
    coalesce(nullif(trim(p_nom), ''), 'Sans nom'),
    a,
    cp,
    v
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
