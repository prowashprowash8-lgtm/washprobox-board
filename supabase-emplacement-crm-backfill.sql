-- Rattrapage : crée les lignes laveries + crm_laverie_links pour les emplacements
-- déjà présents sur le board AVANT l’installation du trigger (ou si le trigger a échoué).
--
-- Prérequis : même script que supabase-emplacement-crm-sync-trigger.sql déjà exécuté
-- (fonction map_board_address_to_laverie_fields), table crm_laverie_links créée.
--
-- Après exécution : SELECT * FROM public.backfill_emplacements_to_crm();
-- pour voir la liste (ok / erreur par emplacement).

create or replace function public.backfill_emplacements_to_crm()
returns table(emplacement_id uuid, laverie_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  new_id uuid;
  a text;
  cp text;
  v text;
begin
  for r in
    select e.id as eid, e.name, e.address
    from public.emplacements e
    where not exists (
      select 1 from public.crm_laverie_links l where l.emplacement_id = e.id
    )
  loop
    new_id := null;
    begin
      select adresse, code_postal, ville
        into a, cp, v
      from public.map_board_address_to_laverie_fields(r.address);

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
        r.name,
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
        r.eid,
        new_id::text,
        'synced',
        now(),
        null
      );

      emplacement_id := r.eid;
      laverie_id := new_id;
      status := 'ok';
      return next;
    exception
      when others then
        if new_id is not null then
          delete from public.laveries where id = new_id;
        end if;
        emplacement_id := r.eid;
        laverie_id := null;
        status := sqlerrm;
        return next;
    end;
  end loop;
end;
$$;

comment on function public.backfill_emplacements_to_crm() is
  'Crée une laverie CRM + lien pour chaque emplacement sans ligne dans crm_laverie_links.';
