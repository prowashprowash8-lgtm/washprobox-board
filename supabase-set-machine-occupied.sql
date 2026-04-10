-- RPC appelée par l'ESP32 quand l'optocoupleur détecte la machine en marche
-- Passe la machine en "occupe" dans Supabase
-- Exécuter dans Supabase → SQL Editor → Run

CREATE OR REPLACE FUNCTION public.set_machine_occupied(p_esp32_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_esp32_id IS NULL OR trim(p_esp32_id) = '' THEN
    RETURN false;
  END IF;

  UPDATE machines
  SET statut = 'occupe',
      estimated_end_time = NULL
  WHERE esp32_id = trim(p_esp32_id);

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_machine_occupied(text) TO anon;
GRANT EXECUTE ON FUNCTION public.set_machine_occupied(text) TO authenticated;
