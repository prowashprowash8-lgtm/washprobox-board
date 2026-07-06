-- Fix : permettre au dashboard (anon) d'insérer des commandes
-- Exécuter dans Supabase → SQL Editor
-- Sans ça, le bouton "Lancer le cycle (test)" du board échoue

DROP POLICY IF EXISTS "Authenticated users can insert commands" ON machine_commands;
DROP POLICY IF EXISTS "Anon can insert commands" ON machine_commands;
CREATE POLICY "Anon can insert commands"
  ON machine_commands FOR INSERT
  TO anon
  WITH CHECK (true);
