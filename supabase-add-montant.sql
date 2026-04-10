-- Ajouter la colonne montant à transactions (le board l'utilise)
-- Exécuter dans Supabase → SQL Editor

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS montant decimal(10,2) DEFAULT 0;

-- Rendre user_id et emplacement_id nullable pour les transactions du board (sans utilisateur)
ALTER TABLE public.transactions ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.transactions ALTER COLUMN emplacement_id DROP NOT NULL;
