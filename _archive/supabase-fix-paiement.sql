-- Script pour corriger les erreurs au paiement
-- Exécuter dans Supabase : SQL Editor > New query > Coller > Run

-- 1. Table machine_commands (commandes WiFi pour l'ESP32)
CREATE TABLE IF NOT EXISTS machine_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
  esp32_id TEXT NOT NULL,
  command TEXT NOT NULL DEFAULT 'START',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_machine_commands_esp32_pending 
  ON machine_commands(esp32_id, status) WHERE status = 'pending';

ALTER TABLE machine_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert commands" ON machine_commands;
CREATE POLICY "Authenticated users can insert commands"
  ON machine_commands FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can read pending commands" ON machine_commands;
CREATE POLICY "Anon can read pending commands"
  ON machine_commands FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can update command status" ON machine_commands;
CREATE POLICY "Anon can update command status"
  ON machine_commands FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- 2. Colonnes manquantes sur transactions (si la table existe déjà)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'transactions') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'machine_nom') THEN
      ALTER TABLE transactions ADD COLUMN machine_nom TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'emplacement_id') THEN
      ALTER TABLE transactions ADD COLUMN emplacement_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'emplacement_name') THEN
      ALTER TABLE transactions ADD COLUMN emplacement_name TEXT;
    END IF;
  END IF;
END $$;

-- 3. RLS sur transactions : permettre l'insertion aux utilisateurs connectés
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can insert transactions" ON transactions;
CREATE POLICY "Authenticated can insert transactions"
  ON transactions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can read transactions" ON transactions;
CREATE POLICY "Authenticated can read transactions"
  ON transactions FOR SELECT TO authenticated USING (true);
