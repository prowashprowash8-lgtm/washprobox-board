-- Fix : le board ne peut plus créer de codes promo
-- Exécuter dans Supabase → SQL Editor
-- (Le board utilise le rôle "authenticated" car l'admin est connecté)

-- 1. Donner les droits à authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO anon;

-- 2. S'assurer que la policy authenticated existe
DROP POLICY IF EXISTS "Authenticated can manage promo_codes" ON public.promo_codes;
CREATE POLICY "Authenticated can manage promo_codes"
  ON public.promo_codes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Policy anon (au cas où)
DROP POLICY IF EXISTS "Anon can insert promo_codes" ON public.promo_codes;
CREATE POLICY "Anon can insert promo_codes"
  ON public.promo_codes FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update promo_codes" ON public.promo_codes;
CREATE POLICY "Anon can update promo_codes"
  ON public.promo_codes FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can delete promo_codes" ON public.promo_codes;
CREATE POLICY "Anon can delete promo_codes"
  ON public.promo_codes FOR DELETE TO anon USING (true);
