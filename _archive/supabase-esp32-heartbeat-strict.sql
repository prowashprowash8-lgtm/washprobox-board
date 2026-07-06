-- Remettre check_esp32_online avec timeout STRICT 10 secondes
-- L'ESP envoie un heartbeat toutes les 5s → si pas vu depuis 10s il est vraiment éteint
-- SUPPRIMER les fallbacks machine_commands (ils gardaient la machine "en ligne" trop longtemps)
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

  SELECT last_seen INTO v_last
  FROM esp32_heartbeat
  WHERE lower(trim(esp32_id)) = lower(trim(p_esp32_id));

  -- En ligne si heartbeat reçu il y a moins de 10 secondes
  -- (heartbeat toutes les 5s → 2 battements manqués = éteint)
  RETURN v_last IS NOT NULL AND (now() - v_last) < interval '10 seconds';
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_esp32_online(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_esp32_online(text) TO authenticated;
