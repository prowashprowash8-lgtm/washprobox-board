-- Gestion du statut Occupé + estimated_end_time
-- Exécuter dans Supabase → SQL Editor

-- 1. Colonnes sur transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS estimated_end_time timestamptz;

-- 2. Colonnes sur machines (pour affichage compte à rebours)
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS estimated_end_time timestamptz;

-- 3. RPC : enregistrer la durée après paiement (appelé par l'app après popup)
CREATE OR REPLACE FUNCTION public.set_transaction_duration(
  p_transaction_id uuid,
  p_minutes integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_machine_id uuid;
  v_end_time timestamptz;
BEGIN
  IF p_minutes IS NULL OR p_minutes < 1 OR p_minutes > 300 THEN
    RETURN false;
  END IF;

  v_end_time := now() + (p_minutes || ' minutes')::interval;

  UPDATE transactions
  SET estimated_end_time = v_end_time
  WHERE id = p_transaction_id AND status = 'completed';

  IF NOT FOUND THEN RETURN false; END IF;

  SELECT machine_id INTO v_machine_id FROM transactions WHERE id = p_transaction_id;

  UPDATE machines
  SET statut = 'occupe',
      estimated_end_time = v_end_time
  WHERE id = v_machine_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_transaction_duration(uuid, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.set_transaction_duration(uuid, integer) TO authenticated;

-- 4. RPC : libérer les machines dont le temps est écoulé (appelé par cron ou manuellement)
CREATE OR REPLACE FUNCTION public.release_expired_machines()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE machines
  SET statut = 'disponible',
      estimated_end_time = NULL
  WHERE statut IN ('occupe', 'occupied')
    AND estimated_end_time IS NOT NULL
    AND estimated_end_time <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_expired_machines() TO anon;
GRANT EXECUTE ON FUNCTION public.release_expired_machines() TO authenticated;
