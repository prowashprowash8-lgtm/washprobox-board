-- Permettre au WashPro Board de lire les profils créés par l'app WashPro
-- Exécuter dans Supabase : SQL Editor > New query > Coller > Run
-- Les admins connectés au board (Supabase Auth) pourront voir tous les utilisateurs de l'app

-- Policy : les utilisateurs authentifiés (admins du board) peuvent lire les profils
CREATE POLICY "Board admins can read profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
