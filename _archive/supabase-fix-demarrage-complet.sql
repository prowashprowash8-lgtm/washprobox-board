-- ============================================================
-- FIX COMPLET : machine reste bien en "occupe" après paiement
-- Exécuter dans Supabase → SQL Editor → Run
-- ============================================================

-- 1. Ajouter colonne occupe_since pour tracer le début du cycle
ALTER TABLE public.machines ADD COLUMN IF NOT EXISTS occupe_since timestamptz;

-- 2. release_machine : bloque la libération pendant 2 min après le démarrage
--    (évite le bug : machine passe en occupe puis revient en disponible)
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

  -- Bloquer si une commande START est encore en attente (machine en train de démarrer)
  IF EXISTS (
    SELECT 1 FROM machine_commands
    WHERE esp32_id = trim(p_esp32_id)
      AND command = 'START'
      AND status = 'pending'
      AND created_at > now() - interval '5 minutes'
  ) THEN
    RETURN false;
  END IF;

  -- Bloquer pendant les 2 premières minutes après le démarrage du cycle
  IF EXISTS (
    SELECT 1 FROM machines
    WHERE esp32_id = trim(p_esp32_id)
      AND statut IN ('occupe', 'occupied')
      AND occupe_since > now() - interval '2 minutes'
  ) THEN
    RETURN false;
  END IF;

  UPDATE machines
  SET statut = 'disponible',
      estimated_end_time = NULL,
      occupe_since = NULL
  WHERE esp32_id = trim(p_esp32_id);

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_machine(text) TO anon;
GRANT EXECUTE ON FUNCTION public.release_machine(text) TO authenticated;

-- 3. create_transaction_and_start_machine : passe en occupe + enregistre occupe_since
CREATE OR REPLACE FUNCTION public.create_transaction_and_start_machine(
  p_user_id uuid,
  p_machine_id uuid,
  p_emplacement_id uuid,
  p_esp32_id text,
  p_amount decimal default 0,
  p_payment_method text default 'promo',
  p_promo_code text default null
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id uuid;
  v_command_id uuid;
  v_centimes integer;
BEGIN
  v_centimes := GREATEST(0, COALESCE(ROUND(p_amount * 100)::integer, 0));

  INSERT INTO transactions (user_id, machine_id, emplacement_id, amount, montant_centimes, payment_method, promo_code, status)
  VALUES (p_user_id, p_machine_id, p_emplacement_id, p_amount, v_centimes, p_payment_method, p_promo_code, 'completed')
  RETURNING id INTO v_transaction_id;

  INSERT INTO machine_commands (esp32_id, command, status, user_id, transaction_id)
  VALUES (p_esp32_id, 'START', 'pending', p_user_id, v_transaction_id)
  RETURNING id INTO v_command_id;

  UPDATE transactions SET machine_command_id = v_command_id WHERE id = v_transaction_id;

  -- Passe la machine en occupe immédiatement avec le timestamp de démarrage
  UPDATE machines
  SET statut = 'occupe',
      estimated_end_time = NULL,
      occupe_since = now()
  WHERE id = p_machine_id;

  RETURN json_build_object(
    'transaction_id', v_transaction_id,
    'machine_command_id', v_command_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transaction_and_start_machine(uuid, uuid, uuid, text, decimal, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_transaction_and_start_machine(uuid, uuid, uuid, text, decimal, text, text) TO authenticated;

-- 4. set_transaction_duration : met aussi à jour occupe_since
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
      estimated_end_time = v_end_time,
      occupe_since = now()
  WHERE id = v_machine_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_transaction_duration(uuid, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.set_transaction_duration(uuid, integer) TO authenticated;
