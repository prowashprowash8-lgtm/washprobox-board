-- Permettre au board de créer et gérer les emplacements (laveries)
-- Exécuter dans Supabase → SQL Editor si la création échoue

ALTER TABLE public.emplacements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Board can read emplacements" ON public.emplacements;
CREATE POLICY "Board can read emplacements"
  ON public.emplacements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Board can insert emplacements" ON public.emplacements;
CREATE POLICY "Board can insert emplacements"
  ON public.emplacements FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Board can update emplacements" ON public.emplacements;
CREATE POLICY "Board can update emplacements"
  ON public.emplacements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Board can delete emplacements" ON public.emplacements;
CREATE POLICY "Board can delete emplacements"
  ON public.emplacements FOR DELETE TO authenticated USING (true);

-- anon (app et board)
DROP POLICY IF EXISTS "anon read emplacements" ON public.emplacements;
CREATE POLICY "anon read emplacements"
  ON public.emplacements FOR SELECT TO anon USING (true);
