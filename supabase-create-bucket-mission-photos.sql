-- Créer le bucket mission-photos pour les photos des missions
-- Exécute ce fichier dans Supabase : SQL Editor > New query > Coller > Run

-- 1. Créer le bucket (si pas déjà existant)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'mission-photos') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('mission-photos', 'mission-photos', true);
  ELSE
    UPDATE storage.buckets SET public = true WHERE id = 'mission-photos';
  END IF;
END $$;

-- 2. Policies pour permettre l'upload (anon) et la lecture
DROP POLICY IF EXISTS "mission-photos upload" ON storage.objects;
CREATE POLICY "mission-photos upload" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'mission-photos');

DROP POLICY IF EXISTS "mission-photos read" ON storage.objects;
CREATE POLICY "mission-photos read" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'mission-photos');

DROP POLICY IF EXISTS "mission-photos read authenticated" ON storage.objects;
CREATE POLICY "mission-photos read authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'mission-photos');
