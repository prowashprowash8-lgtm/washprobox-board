-- Restaurer machine_commands pour que Board, App et ESP32 fonctionnent
-- Exécuter dans Supabase → SQL Editor

-- 1. Donner les droits (nécessaire en plus des policies)
GRANT INSERT, SELECT, UPDATE ON machine_commands TO anon;
GRANT INSERT, SELECT, UPDATE ON machine_commands TO authenticated;

-- 2. Supprimer les anciennes policies
DROP POLICY IF EXISTS "Authenticated users can insert commands" ON machine_commands;
DROP POLICY IF EXISTS "Anon can insert commands" ON machine_commands;
DROP POLICY IF EXISTS "Anon can read pending commands" ON machine_commands;
DROP POLICY IF EXISTS "Anon can update command status" ON machine_commands;

-- 3. RLS activé + policies
ALTER TABLE machine_commands ENABLE ROW LEVEL SECURITY;

-- Board (connecté) : authenticated peut insérer
CREATE POLICY "Authenticated can insert commands"
  ON machine_commands FOR INSERT TO authenticated WITH CHECK (true);

-- Board (non connecté) / App / ESP32 : anon peut insérer
CREATE POLICY "Anon can insert commands"
  ON machine_commands FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can read pending commands"
  ON machine_commands FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can update command status"
  ON machine_commands FOR UPDATE TO anon USING (true) WITH CHECK (true);
