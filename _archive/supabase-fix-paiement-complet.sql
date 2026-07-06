-- Fix complet : paiement app → commande ESP32 → relais
-- Exécuter dans Supabase → SQL Editor
-- (Utilisateur connecté = rôle "authenticated", pas "anon")

-- 1. RPC create_transaction_and_start_machine : autoriser authenticated
GRANT EXECUTE ON FUNCTION public.create_transaction_and_start_machine(uuid, uuid, uuid, text, decimal, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_transaction_and_start_machine(uuid, uuid, uuid, text, decimal, text, text) TO authenticated;

-- 2. machine_commands : droits + policies (board, app, ESP32)
GRANT INSERT, SELECT, UPDATE ON machine_commands TO anon;
GRANT INSERT, SELECT, UPDATE ON machine_commands TO authenticated;

DROP POLICY IF EXISTS "Authenticated can insert commands" ON machine_commands;
DROP POLICY IF EXISTS "Authenticated users can insert commands" ON machine_commands;
DROP POLICY IF EXISTS "Anon can insert commands" ON machine_commands;
DROP POLICY IF EXISTS "Anon can read pending commands" ON machine_commands;
DROP POLICY IF EXISTS "Anon can update command status" ON machine_commands;

ALTER TABLE machine_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can insert commands"
  ON machine_commands FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Anon can insert commands"
  ON machine_commands FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can read pending commands"
  ON machine_commands FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can update command status"
  ON machine_commands FOR UPDATE TO anon USING (true) WITH CHECK (true);
