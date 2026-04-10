-- Tables pour les missions envoyées aux laveries
-- Une mission peut être envoyée à une ou plusieurs laveries (emplacements)

-- Table missions
CREATE TABLE IF NOT EXISTS public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre text NOT NULL,
  description text,
  recompense text DEFAULT 'Lavage gratuit',
  created_at timestamptz DEFAULT now()
);

-- Table de liaison mission <-> emplacements (laveries)
CREATE TABLE IF NOT EXISTS public.mission_emplacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  emplacement_id uuid NOT NULL REFERENCES public.emplacements(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(mission_id, emplacement_id)
);

-- Index pour les requêtes
CREATE INDEX IF NOT EXISTS idx_mission_emplacements_mission ON public.mission_emplacements(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_emplacements_emplacement ON public.mission_emplacements(emplacement_id);

-- RLS
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_emplacements ENABLE ROW LEVEL SECURITY;

-- Policies : authenticated (board) peut tout faire
DROP POLICY IF EXISTS "Board missions" ON public.missions;
CREATE POLICY "Board missions" ON public.missions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Board mission_emplacements" ON public.mission_emplacements;
CREATE POLICY "Board mission_emplacements" ON public.mission_emplacements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- anon peut lire (pour l'app utilisateur)
DROP POLICY IF EXISTS "anon read missions" ON public.missions;
CREATE POLICY "anon read missions" ON public.missions FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon read mission_emplacements" ON public.mission_emplacements;
CREATE POLICY "anon read mission_emplacements" ON public.mission_emplacements FOR SELECT TO anon USING (true);
