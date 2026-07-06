-- Autoriser le board (anon) à créer des codes promo
-- Exécuter dans Supabase → SQL Editor → Run

-- Ajouter uses_remaining si absent (pour compatibilité app)
ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS uses_remaining integer;

-- Policy : anon peut insérer et mettre à jour (le board n'utilise pas Supabase Auth)
DROP POLICY IF EXISTS "Anon can insert promo_codes" ON public.promo_codes;
CREATE POLICY "Anon can insert promo_codes"
  ON public.promo_codes FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can update promo_codes" ON public.promo_codes;
CREATE POLICY "Anon can update promo_codes"
  ON public.promo_codes FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon can delete promo_codes" ON public.promo_codes;
CREATE POLICY "Anon can delete promo_codes"
  ON public.promo_codes FOR DELETE TO anon USING (true);
