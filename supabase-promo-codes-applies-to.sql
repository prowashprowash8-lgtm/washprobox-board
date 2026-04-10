-- Colonne : code promo limité au lave-linge, au sèche-linge, ou les deux
-- À exécuter dans Supabase si ce n’est pas déjà fait (voir aussi washproapp/supabase/promo-codes-machine-type.sql).

ALTER TABLE public.promo_codes
  ADD COLUMN IF NOT EXISTS applies_to text DEFAULT 'both';

COMMENT ON COLUMN public.promo_codes.applies_to IS
  'both = tous ; lavage = lave-linge uniquement ; sechage = sèche-linge uniquement';

UPDATE public.promo_codes SET applies_to = 'both' WHERE applies_to IS NULL;
