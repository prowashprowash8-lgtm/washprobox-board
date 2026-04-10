-- Soumissions de missions par les utilisateurs (photos envoyées)

CREATE TABLE IF NOT EXISTS public.mission_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id uuid,
  emplacement_id uuid NOT NULL REFERENCES public.emplacements(id) ON DELETE CASCADE,
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed')),
  photo_urls text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_mission_submissions_mission ON public.mission_submissions(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_submissions_user ON public.mission_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_mission_submissions_emplacement ON public.mission_submissions(emplacement_id);

ALTER TABLE public.mission_submissions ENABLE ROW LEVEL SECURITY;

-- Board (authenticated) : tout
DROP POLICY IF EXISTS "Board mission_submissions" ON public.mission_submissions;
CREATE POLICY "Board mission_submissions" ON public.mission_submissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- anon : insert (app envoie), select (app lit ses soumissions)
DROP POLICY IF EXISTS "anon insert mission_submissions" ON public.mission_submissions;
CREATE POLICY "anon insert mission_submissions" ON public.mission_submissions FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon read mission_submissions" ON public.mission_submissions;
CREATE POLICY "anon read mission_submissions" ON public.mission_submissions FOR SELECT TO anon USING (true);

-- Bucket Storage mission-photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('mission-photos', 'mission-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies storage : upload (anon) et lecture (public)
DROP POLICY IF EXISTS "mission-photos upload" ON storage.objects;
CREATE POLICY "mission-photos upload" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'mission-photos');

DROP POLICY IF EXISTS "mission-photos read" ON storage.objects;
CREATE POLICY "mission-photos read" ON storage.objects
  FOR SELECT TO anon USING (bucket_id = 'mission-photos');

DROP POLICY IF EXISTS "mission-photos read authenticated" ON storage.objects;
CREATE POLICY "mission-photos read authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'mission-photos');
