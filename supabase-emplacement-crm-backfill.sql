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
      )
      on conflict (emplacement_id)
      do update set
        crm_site_id = excluded.crm_site_id,
        sync_status = 'synced',
        synced_at = now(),
        last_error = null;

      emplacement_id := r.eid;
      laverie_id := new_id;
      status := 'ok';
      return next;
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
        where l.emplacement_id = r.eid;
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
