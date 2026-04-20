-- Retry automatique des syncs échouées board -> CRM.
-- Prérequis:
--   1) supabase-crm-laverie-links-hardening.sql
--   2) supabase-emplacement-crm-sync-trigger.sql
--   3) supabase-emplacement-crm-backfill.sql

create or replace function public.retry_failed_crm_laverie_links(p_limit integer default 50)
returns table(emplacement_id uuid, crm_site_id text, sync_status text, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  new_id uuid;
begin
  for r in
    select l.emplacement_id, e.name, e.address
    from public.crm_laverie_links l
    join public.emplacements e on e.id = l.emplacement_id
    where l.sync_status = 'failed'
       or coalesce(nullif(trim(l.crm_site_id), ''), '') = ''
    order by l.updated_at asc nulls first, l.synced_at asc nulls first
    limit greatest(1, coalesce(p_limit, 50))
  loop
    begin
      new_id := public.insert_crm_laverie_from_board(r.emplacement_id, r.name, r.address);

      update public.crm_laverie_links l
      set
        crm_site_id = new_id::text,
        sync_status = 'synced',
        synced_at = now(),
        last_error = null,
        updated_at = now()
      where l.emplacement_id = r.emplacement_id;

      emplacement_id := r.emplacement_id;
      crm_site_id := new_id::text;
      sync_status := 'synced';
      message := 'ok';
      return next;
    exception
      when others then
        update public.crm_laverie_links l
        set
          sync_status = 'failed',
          last_error = sqlerrm,
          attempt_count = coalesce(l.attempt_count, 0) + 1,
          updated_at = now()
        where l.emplacement_id = r.emplacement_id;

        emplacement_id := r.emplacement_id;
        crm_site_id := null;
        sync_status := 'failed';
        message := sqlerrm;
        return next;
    end;
  end loop;
end;
$$;

comment on function public.retry_failed_crm_laverie_links(integer) is
  'Retente la sync CRM des liens failed/pending sans crm_site_id.';

-- Optionnel : job pg_cron toutes les minutes (si extension disponible).
-- select cron.schedule(
--   'retry_failed_crm_laverie_links_every_minute',
--   '* * * * *',
--   $$select * from public.retry_failed_crm_laverie_links(25);$$
-- );
