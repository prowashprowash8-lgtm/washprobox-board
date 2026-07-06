-- Ajouter user_id et refunded aux transactions
-- Exécuter dans Supabase : SQL Editor > New query > Coller > Run

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS refunded BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);

-- Autoriser la mise à jour (pour remboursements)
DROP POLICY IF EXISTS "Authenticated can update transactions" ON transactions;
CREATE POLICY "Authenticated can update transactions"
  ON transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
