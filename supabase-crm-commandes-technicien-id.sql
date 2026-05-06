-- Associer les commandes (pièces) à un technicien CRM.
-- Exécuter UNE FOIS dans Supabase → SQL Editor.

begin;

alter table if exists public.commandes
  add column if not exists technicien_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'commandes_technicien_id_fkey'
  ) then
    alter table public.commandes
      add constraint commandes_technicien_id_fkey
      foreign key (technicien_id)
      references public.crm_users (id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_commandes_technicien_id
  on public.commandes (technicien_id);

commit;

