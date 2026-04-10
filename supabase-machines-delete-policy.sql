-- Permettre au board de supprimer des machines
-- Exécuter dans Supabase → SQL Editor si le bouton Supprimer ne fonctionne pas

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

-- authenticated (board connecté)
DROP POLICY IF EXISTS "Board can delete machines" ON public.machines;
CREATE POLICY "Board can delete machines"
  ON public.machines FOR DELETE
  TO authenticated
  USING (true);

-- anon (au cas où)
DROP POLICY IF EXISTS "anon delete machines" ON public.machines;
CREATE POLICY "anon delete machines"
  ON public.machines FOR DELETE
  TO anon
  USING (true);
