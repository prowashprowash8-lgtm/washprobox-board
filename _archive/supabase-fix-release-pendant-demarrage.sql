-- Corriger release_machine pour ne pas libérer la machine
-- si une commande START est encore en attente (machine en train de démarrer)
-- Exécuter dans Supabase → SQL Editor → Run

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

  -- Ne pas libérer si une commande START récente est encore en attente
  -- (la machine est en train de démarrer, l'optocoupleur n'a pas encore détecté le courant)
  IF EXISTS (
    SELECT 1
    FROM machine_commands
    WHERE esp32_id = trim(p_esp32_id)
      AND command = 'START'
      AND status = 'pending'
      AND created_at > now() - interval '3 minutes'
  ) THEN
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
