-- Ajouter les colonnes aux machines (numéro de série, marque, modèle)
-- Exécuter dans Supabase : SQL Editor > New query > Coller > Run

ALTER TABLE machines ADD COLUMN IF NOT EXISTS numero_serie TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS marque TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS modele TEXT;
