-- RPC : l'ESP32 appelle cette fonction quand la machine est disponible
-- Exécuter dans Supabase → SQL Editor

CREATE OR REPLACE FUNCTION public.release_machine(p_esp32_id text)
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
  SET statut = 'disponible',
      estimated_end_time = NULL
  WHERE esp32_id = trim(p_esp32_id);

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_machine(text) TO anon;
GRANT EXECUTE ON FUNCTION public.release_machine(text) TO authenticated;
