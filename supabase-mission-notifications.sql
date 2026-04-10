-- Notifications missions : utilisateurs (mission postée) + admin (soumission)
-- Exécuter dans Supabase → SQL Editor

-- 1. Tokens pour les alertes admin (quand un utilisateur envoie une mission)
CREATE TABLE IF NOT EXISTS public.mission_alert_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_push_token text NOT NULL UNIQUE,
  label text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE mission_alert_tokens ENABLE ROW LEVEL SECURITY;

-- Board (authenticated) peut gérer les tokens admin
DROP POLICY IF EXISTS "Board mission_alert_tokens" ON mission_alert_tokens;
CREATE POLICY "Board mission_alert_tokens" ON mission_alert_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- App (anon) peut insérer son token pour recevoir les alertes (bouton "Activer alertes missions")
DROP POLICY IF EXISTS "anon insert mission_alert_tokens" ON mission_alert_tokens;
CREATE POLICY "anon insert mission_alert_tokens" ON mission_alert_tokens FOR INSERT TO anon WITH CHECK (true);

-- 2. RPC pour notifier les utilisateurs quand une mission est postée
-- (appelée depuis le board après création de mission)
CREATE OR REPLACE FUNCTION public.notify_mission_posted(
  p_mission_id uuid,
  p_emplacement_ids uuid[],
  p_titre text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_ids uuid[];
BEGIN
  -- Utilisateurs qui ont utilisé ces laveries (transactions)
  SELECT ARRAY_AGG(DISTINCT user_id) INTO v_user_ids
  FROM transactions
  WHERE emplacement_id = ANY(p_emplacement_ids)
    AND user_id IS NOT NULL;
  
  -- La fonction ne fait que retourner les infos ; l'Edge Function fera l'envoi
  RETURN jsonb_build_object(
    'mission_id', p_mission_id,
    'titre', p_titre,
    'user_ids', COALESCE(v_user_ids, ARRAY[]::uuid[])
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_mission_posted(uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_mission_posted(uuid, uuid[], text) TO anon;

-- ============================================================
-- CONFIGURATION WEBHOOK (Supabase Dashboard)
-- ============================================================
-- Pour recevoir une notif admin quand un utilisateur envoie une mission :
-- 1. Dashboard → Database → Webhooks → Create webhook
-- 2. Table : mission_submissions
-- 3. Events : Insert
-- 4. Type : Edge Function → mission-notifications
-- 5. Headers : Add auth header with service key (ou laisser vide si la fonction accepte)
