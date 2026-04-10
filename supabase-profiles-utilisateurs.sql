-- Table profiles : utilisateurs ayant créé un compte (synchro avec Supabase Auth)
-- Exécuter dans Supabase : SQL Editor > New query > Coller > Run

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_sign_in_at TIMESTAMPTZ,
  raw_user_meta_data JSONB
);

-- Trigger : créer/mettre à jour le profil à chaque nouvel utilisateur
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at, last_sign_in_at, raw_user_meta_data)
  VALUES (NEW.id, NEW.email, NEW.created_at, NEW.last_sign_in_at, NEW.raw_user_meta_data)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    last_sign_in_at = EXCLUDED.last_sign_in_at,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Remplir avec les utilisateurs existants
INSERT INTO profiles (id, email, created_at, last_sign_in_at, raw_user_meta_data)
SELECT id, email, created_at, last_sign_in_at, raw_user_meta_data
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  last_sign_in_at = EXCLUDED.last_sign_in_at,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data;

-- RLS : les utilisateurs authentifiés peuvent lire les profils
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read profiles" ON profiles;
CREATE POLICY "Authenticated can read profiles"
  ON profiles FOR SELECT TO authenticated USING (true);
