-- WashPro : Détection ESP32 - machine allumée = payer, machine éteinte = bloquer
-- Exécuter dans Supabase → SQL Editor

CREATE OR REPLACE FUNCTION public.check_esp32_online(p_esp32_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last timestamptz;
BEGIN
  IF p_esp32_id IS NULL OR trim(p_esp32_id) = '' THEN
    RETURN false;
  END IF;

  -- Heartbeat : 60 secondes (tolérant quand ESP allumé, strict quand éteint)
  SELECT last_seen INTO v_last
  FROM esp32_heartbeat
  WHERE lower(trim(esp32_id)) = lower(trim(p_esp32_id));

  RETURN v_last IS NOT NULL AND (now() - v_last) < interval '60 seconds';
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_esp32_online(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_esp32_online(text) TO authenticated;
