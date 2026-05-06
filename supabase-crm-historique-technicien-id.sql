-- Ajoute un lien "historique -> technicien (crm_users)" pour attribuer les clôtures/tournées à un compte CRM.
-- Exécuter UNE FOIS dans Supabase → SQL Editor.

begin;

alter table if exists public.historique
  add column if not exists technicien_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'historique_technicien_id_fkey'
  ) then
    alter table public.historique
      add constraint historique_technicien_id_fkey
      foreign key (technicien_id)
      references public.crm_users (id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_historique_technicien_id
  on public.historique (technicien_id);

commit;

