-- Permettre au board d'ajouter/modifier/supprimer des machines
-- Exécuter dans Supabase → SQL Editor si les mises à jour échouent

-- Colonnes optionnelles (si manquantes)
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS numero_serie text;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS marque text;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS modele text;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS name text;

-- Synchroniser nom → name pour l'app (affiche machine.name || machine.nom)
UPDATE public.machines SET name = nom WHERE name IS NULL AND nom IS NOT NULL;

-- RLS : policies pour authenticated ET anon (le board peut utiliser l'un ou l'autre)
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Board can read machines" ON public.machines;
CREATE POLICY "Board can read machines"
  ON public.machines FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Board can insert machines" ON public.machines;
CREATE POLICY "Board can insert machines"
  ON public.machines FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Board can update machines" ON public.machines;
CREATE POLICY "Board can update machines"
  ON public.machines FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Board can delete machines" ON public.machines;
CREATE POLICY "Board can delete machines"
  ON public.machines FOR DELETE
  TO authenticated
  USING (true);

-- anon (au cas où le board utilise la clé anon avec session)
DROP POLICY IF EXISTS "anon read machines" ON public.machines;
CREATE POLICY "anon read machines"
  ON public.machines FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon update machines" ON public.machines;
CREATE POLICY "anon update machines"
  ON public.machines FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon delete machines" ON public.machines;
CREATE POLICY "anon delete machines"
  ON public.machines FOR DELETE TO anon USING (true);

-- Si RLS bloque tout : désactiver temporairement pour tester
-- ALTER TABLE public.machines DISABLE ROW LEVEL SECURITY;
