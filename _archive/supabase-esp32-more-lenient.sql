-- WashPro : Détection ESP32 plus tolérante
-- Exécuter dans Supabase → SQL Editor
-- Résout "l'app ne trouve pas l'ESP" quand il est bien allumé

CREATE OR REPLACE FUNCTION public.check_esp32_online(p_esp32_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
  v_any_recent boolean;
BEGIN
  IF p_esp32_id IS NULL OR trim(p_esp32_id) = '' THEN
    RETURN false;
  END IF;

  -- 1. Heartbeat : 60 secondes (ESP32 poll toutes les 5s, tolère les micro-coupures)
  SELECT last_seen INTO v_last
  FROM esp32_heartbeat
  WHERE esp32_id = trim(p_esp32_id);

  IF v_last IS NOT NULL AND (now() - v_last) < interval '60 seconds' THEN
    RETURN true;
  END IF;

  -- 2. Fallback : commande "done" récente (ESP32 a traité une commande)
  IF EXISTS (
    SELECT 1 FROM machine_commands
    WHERE esp32_id = trim(p_esp32_id)
      AND status = 'done'
      AND created_at > now() - interval '10 minutes'
  ) THEN
    RETURN true;
  END IF;

  -- 3. Fallback : toute commande récente (pending ou done) = ESP32 actif
  SELECT EXISTS (
    SELECT 1 FROM machine_commands
    WHERE esp32_id = trim(p_esp32_id)
      AND created_at > now() - interval '10 minutes'
  ) INTO v_any_recent;

  RETURN v_any_recent;
END;
$$;
