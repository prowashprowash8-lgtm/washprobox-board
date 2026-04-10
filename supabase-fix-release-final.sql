-- FIX FINAL : release_machine bloquée 60s après un START
-- (temps nécessaire pour que l'optocoupleur détecte le courant)
-- Après 60s, c'est uniquement l'optocoupleur qui contrôle le statut.
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

  -- Bloquer pendant 60s après un START (le temps que l'opto détecte le courant)
  IF EXISTS (
    SELECT 1 FROM machine_commands
    WHERE esp32_id = trim(p_esp32_id)
      AND command = 'START'
      AND status IN ('pending', 'done')
      AND created_at > now() - interval '60 seconds'
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
