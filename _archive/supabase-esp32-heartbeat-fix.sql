-- WashPro : Détection ESP32 - bloquer paiement si machine éteinte
-- Exécuter dans Supabase → SQL Editor (une seule fois)

-- RPC : insensible à la casse, timeout 2 min, fallback si au moins 1 heartbeat récent
CREATE OR REPLACE FUNCTION public.check_esp32_online(p_esp32_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
  v_count int;
BEGIN
  IF p_esp32_id IS NULL OR trim(p_esp32_id) = '' THEN
    RETURN false;
  END IF;

  -- 1. Match direct (insensible à la casse)
  SELECT last_seen INTO v_last
  FROM esp32_heartbeat
  WHERE lower(trim(esp32_id)) = lower(trim(p_esp32_id));

  IF v_last IS NOT NULL AND (now() - v_last) < interval '2 minutes' THEN
    RETURN true;
  END IF;

  -- 2. Fallback : 1 seul ESP32 dans la table
  SELECT count(*) INTO v_count FROM esp32_heartbeat;
  IF v_count = 1 THEN
    SELECT last_seen INTO v_last FROM esp32_heartbeat LIMIT 1;
    RETURN v_last IS NOT NULL AND (now() - v_last) < interval '2 minutes';
  END IF;

  -- 3. Fallback : au moins 1 heartbeat récent (machine allumée quelque part)
  SELECT last_seen INTO v_last
  FROM esp32_heartbeat
  WHERE (now() - last_seen) < interval '2 minutes'
  LIMIT 1;
  RETURN v_last IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_esp32_online(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_esp32_online(text) TO authenticated;
