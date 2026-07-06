-- WashPro : Améliorer la reconnexion ESP32 après veille
-- Quand la machine sort de veille, l'ESP32 met 10-30s à se reconnecter au WiFi.
-- Exécuter dans Supabase → SQL Editor

CREATE OR REPLACE FUNCTION public.check_esp32_online(p_esp32_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
  v_recent_done boolean;
BEGIN
  IF p_esp32_id IS NULL OR trim(p_esp32_id) = '' THEN
    RETURN false;
  END IF;

  -- 1. Heartbeat : 30 secondes (au lieu de 15) pour tolérer les micro-coupures
  SELECT last_seen INTO v_last
  FROM esp32_heartbeat
  WHERE esp32_id = trim(p_esp32_id);

  IF v_last IS NOT NULL AND (now() - v_last) < interval '30 seconds' THEN
    RETURN true;
  END IF;

  -- 2. Fallback : commande "done" récente = ESP32 actif récemment
  SELECT EXISTS (
    SELECT 1 FROM machine_commands
    WHERE esp32_id = trim(p_esp32_id)
      AND status = 'done'
      AND created_at > now() - interval '5 minutes'
  ) INTO v_recent_done;

  RETURN v_recent_done;
END;
$$;
