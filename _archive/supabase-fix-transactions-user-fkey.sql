-- Corriger la FK user_id : l'app utilise profiles, pas auth.users
-- Exécuter dans Supabase → SQL Editor → Run

-- 1. Supprimer l'ancienne contrainte (référence peut-être auth.users)
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;

-- 2. Recréer la FK vers profiles (table utilisée par l'app washproapp)
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
