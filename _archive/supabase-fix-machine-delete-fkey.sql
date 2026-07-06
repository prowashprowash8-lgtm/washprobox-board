-- Permettre la suppression d'une machine malgré les transactions
-- Les transactions gardent leur historique, machine_id devient NULL
-- Exécuter dans Supabase → SQL Editor

-- 1. Rendre machine_id nullable si besoin (pour ON DELETE SET NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transactions' AND column_name='machine_id' AND is_nullable='NO'
  ) THEN
    ALTER TABLE public.transactions ALTER COLUMN machine_id DROP NOT NULL;
  END IF;
END $$;

-- 2. Supprimer l'ancienne contrainte
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_machine_id_fkey;

-- 3. Rétablir avec ON DELETE SET NULL (les transactions restent, machine_id = null)
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_machine_id_fkey
  FOREIGN KEY (machine_id) REFERENCES public.machines(id) ON DELETE SET NULL;
