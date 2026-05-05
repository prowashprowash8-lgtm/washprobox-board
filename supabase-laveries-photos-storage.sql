-- Bucket + politiques Storage pour l'album photos des fiches laveries (CRM intégré au board)
-- Exécuter dans Supabase : SQL Editor > coller > Run
-- Chemin du fichier : washprobox-board/supabase-laveries-photos-storage.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'laveries-photos') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('laveries-photos', 'laveries-photos', true);
  ELSE
    UPDATE storage.buckets SET public = true WHERE id = 'laveries-photos';
  END IF;
END $$;

-- Connexion board (JWT) : liste / upload / suppression depuis l'app
DROP POLICY IF EXISTS "laveries-photos select authenticated" ON storage.objects;
CREATE POLICY "laveries-photos select authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'laveries-photos');

DROP POLICY IF EXISTS "laveries-photos insert authenticated" ON storage.objects;
CREATE POLICY "laveries-photos insert authenticated" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'laveries-photos');

DROP POLICY IF EXISTS "laveries-photos update authenticated" ON storage.objects;
CREATE POLICY "laveries-photos update authenticated" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'laveries-photos');

DROP POLICY IF EXISTS "laveries-photos delete authenticated" ON storage.objects;
CREATE POLICY "laveries-photos delete authenticated" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'laveries-photos');

-- Lecture des images via URL publique (navigateur sans JWT sur <img src="...">)
DROP POLICY IF EXISTS "laveries-photos select anon" ON storage.objects;
CREATE POLICY "laveries-photos select anon" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'laveries-photos');
