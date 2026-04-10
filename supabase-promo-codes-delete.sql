-- Autoriser le board à supprimer des codes promo
-- Exécuter dans Supabase → SQL Editor → Run

DROP POLICY IF EXISTS "Anon can delete promo_codes" ON public.promo_codes;
CREATE POLICY "Anon can delete promo_codes"
  ON public.promo_codes FOR DELETE TO anon USING (true);
