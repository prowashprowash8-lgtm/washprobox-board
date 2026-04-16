-- Prépare l'accès patron pour la future fonction Edge `manage-board-accounts`.
-- À exécuter sur le projet Supabase du board après `supabase-board-access-control.sql`.

-- Lecture des profils pour l'écran patron
drop policy if exists "board_read_profiles_patron" on public.profiles;
create policy "board_read_profiles_patron"
on public.profiles
for select
using (
  exists (
    select 1
    from public.board_account_roles bar
    where bar.user_id = auth.uid()
      and bar.role = 'patron'
  )
);

-- La création réelle des comptes se fera via une Edge Function avec service role.
-- Variables recommandées pour cette fonction :
-- SUPABASE_URL
-- SUPABASE_ANON_KEY
-- SUPABASE_SERVICE_ROLE_KEY
--
-- La fonction fera :
-- 1) vérifie que l'appelant est "patron"
-- 2) crée le compte auth.users (email + password)
-- 3) upsert dans board_account_roles
-- 4) remplace les lignes board_account_emplacements
