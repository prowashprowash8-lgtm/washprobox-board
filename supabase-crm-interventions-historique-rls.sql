-- RLS pour planning / tournée / historique CRM (board connecté en authenticated).
-- Erreur typique sans ça : « new row violates row-level security policy for table "interventions" »
-- Exécuter UNE FOIS dans Supabase → SQL Editor → Run.
-- Même principe que supabase-crm-commandes-rls (washprocrm) : accès complet pour les comptes connectés.

alter table if exists public.interventions enable row level security;
alter table if exists public.historique enable row level security;

-- ---------- interventions ----------
drop policy if exists "interventions_select_authenticated" on public.interventions;
drop policy if exists "interventions_insert_authenticated" on public.interventions;
drop policy if exists "interventions_update_authenticated" on public.interventions;
drop policy if exists "interventions_delete_authenticated" on public.interventions;

create policy "interventions_select_authenticated"
  on public.interventions for select
  to authenticated
  using (true);

create policy "interventions_insert_authenticated"
  on public.interventions for insert
  to authenticated
  with check (true);

create policy "interventions_update_authenticated"
  on public.interventions for update
  to authenticated
  using (true)
  with check (true);

create policy "interventions_delete_authenticated"
  on public.interventions for delete
  to authenticated
  using (true);

-- ---------- historique (clôture tournée) ----------
drop policy if exists "historique_select_authenticated" on public.historique;
drop policy if exists "historique_insert_authenticated" on public.historique;
drop policy if exists "historique_update_authenticated" on public.historique;
drop policy if exists "historique_delete_authenticated" on public.historique;

create policy "historique_select_authenticated"
  on public.historique for select
  to authenticated
  using (true);

create policy "historique_insert_authenticated"
  on public.historique for insert
  to authenticated
  with check (true);

create policy "historique_update_authenticated"
  on public.historique for update
  to authenticated
  using (true)
  with check (true);

create policy "historique_delete_authenticated"
  on public.historique for delete
  to authenticated
  using (true);
