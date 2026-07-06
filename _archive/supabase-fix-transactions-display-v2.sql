-- Corriger "column e.nom does not exist" + affichage board
-- Exécuter dans Supabase → SQL Editor → Run

-- 1. Ajouter les colonnes manquantes (emplacements/machines peuvent avoir name OU nom)
ALTER TABLE public.emplacements ADD COLUMN IF NOT EXISTS nom text;
ALTER TABLE public.emplacements ADD COLUMN IF NOT EXISTS name text;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='emplacements' AND column_name='name') THEN
    UPDATE public.emplacements SET nom = name WHERE nom IS NULL AND name IS NOT NULL;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='emplacements' AND column_name='nom') THEN
    UPDATE public.emplacements SET name = nom WHERE name IS NULL AND nom IS NOT NULL;
  END IF;
END $$;

ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS nom text;
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS name text;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='machines' AND column_name='name') THEN
    UPDATE public.machines SET nom = name WHERE nom IS NULL AND name IS NOT NULL;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='machines' AND column_name='nom') THEN
    UPDATE public.machines SET name = nom WHERE name IS NULL AND nom IS NOT NULL;
  END IF;
END $$;

-- NE PAS REJOUER get_user_transactions(uuid) ni get_all_transactions() ci-dessous :
-- CRITIQUE #6 et #11 de l'audit. Les versions à jour (avec session_token pour la première,
-- avec vérification auth.uid() pour la seconde) vivent désormais dans
-- refund-request-response-and-promo.sql (app) et supabase-rpc-get-all-transactions-pagination.sql
-- (board). Rejouer ce fichier recréerait des overloads ouverts à anon sans aucune vérification.
