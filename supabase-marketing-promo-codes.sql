-- Table marketing : codes promo
-- Exécuter dans Supabase : SQL Editor > New query > Coller > Run

CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'free' CHECK (type IN ('free', 'percent', 'fixed')),
  value NUMERIC NOT NULL DEFAULT 100,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_expires ON promo_codes(expires_at) WHERE expires_at IS NOT NULL;

-- RLS : lecture/écriture pour les utilisateurs authentifiés
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can manage promo_codes" ON promo_codes;
CREATE POLICY "Authenticated can manage promo_codes"
  ON promo_codes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
