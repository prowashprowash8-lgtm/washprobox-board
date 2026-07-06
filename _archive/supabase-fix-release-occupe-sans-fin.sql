-- Libère aussi les machines en occupe sans estimated_end_time (état incohérent / bug)
-- À exécuter dans Supabase → SQL Editor

DROP FUNCTION IF EXISTS public.release_expired_machines();

CREATE OR REPLACE FUNCTION public.release_expired_machines()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_extra integer;
BEGIN
  UPDATE machines
  SET statut = 'disponible',
      estimated_end_time = NULL
  WHERE statut IN ('occupe', 'occupied')
    AND estimated_end_time IS NOT NULL
    AND estimated_end_time <= now();

  GET DIAGNOSTICS v_extra = ROW_COUNT;
  v_count := v_count + v_extra;

  -- Occupe sans date de fin : ne devrait pas arriver (durée = set_transaction_duration).
  -- Si ça reste bloqué, on repasse en disponible pour débloquer l'app.
  UPDATE machines
  SET statut = 'disponible',
      estimated_end_time = NULL
  WHERE statut IN ('occupe', 'occupied')
    AND estimated_end_time IS NULL;

  GET DIAGNOSTICS v_extra = ROW_COUNT;
  v_count := v_count + v_extra;

  RETURN v_count;
END;
$$;
