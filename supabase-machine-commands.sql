-- Table pour les commandes envoyées aux machines (via WiFi)
-- Exécuter ce SQL dans Supabase : SQL Editor > New query

CREATE TABLE IF NOT EXISTS machine_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES machines(id) ON DELETE CASCADE,
  esp32_id TEXT NOT NULL,
  command TEXT NOT NULL DEFAULT 'START',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ
);

-- Index pour les requêtes de l'ESP32 (polling par esp32_id et status)
CREATE INDEX IF NOT EXISTS idx_machine_commands_esp32_pending 
  ON machine_commands(esp32_id, status) 
  WHERE status = 'pending';

-- RLS : permettre l'insertion aux utilisateurs authentifiés, lecture/mise à jour pour l'ESP32 (anon)
ALTER TABLE machine_commands ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs connectés peuvent insérer des commandes
CREATE POLICY "Authenticated users can insert commands"
  ON machine_commands FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- L'ESP32 (anon) peut lire les commandes en attente pour son esp32_id
CREATE POLICY "Anon can read pending commands"
  ON machine_commands FOR SELECT
  TO anon
  USING (true);

-- L'ESP32 (anon) peut mettre à jour le statut des commandes
CREATE POLICY "Anon can update command status"
  ON machine_commands FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
