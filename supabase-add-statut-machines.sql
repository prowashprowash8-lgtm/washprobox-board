-- Ajouter la colonne statut à machines (si elle n'existe pas)
-- Exécuter AVANT supabase-machine-occupe-des-paiement.sql

-- Si ta table a "status" au lieu de "statut", on ajoute statut
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS statut text DEFAULT 'disponible';

-- Mettre à jour les lignes existantes
UPDATE public.machines SET statut = 'disponible' WHERE statut IS NULL;
