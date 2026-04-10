-- ============================================================
-- SOLUTION FINALE — À exécuter dans Supabase SQL Editor
-- Règle définitivement le statut machine (occupe / disponible)
-- ============================================================

-- 1. set_machine_occupied : appelé par l'ESP32 quand l'opto détecte le courant
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

-- 2. release_machine : appelé par l'ESP32 quand l'opto détecte l'arrêt
--    Libération instantanée — l'Arduino ne l'appelle que sur vraie transition EN MARCHE → ARRETEE
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

-- 3. create_transaction_and_start_machine : passe la machine en 'occupe' dès le paiement
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

  -- Créer la transaction
  INSERT INTO transactions (user_id, machine_id, emplacement_id, amount, montant_centimes, payment_method, promo_code, status)
  VALUES (p_user_id, p_machine_id, p_emplacement_id, p_amount, v_centimes, p_payment_method, p_promo_code, 'completed')
  RETURNING id INTO v_transaction_id;

  -- Créer la commande START pour l'ESP32
  INSERT INTO machine_commands (esp32_id, command, status, user_id, transaction_id)
  VALUES (p_esp32_id, 'START', 'pending', p_user_id, v_transaction_id)
  RETURNING id INTO v_command_id;

  UPDATE transactions SET machine_command_id = v_command_id WHERE id = v_transaction_id;

  -- Passer la machine en 'occupe' immédiatement
  UPDATE machines
  SET statut = 'occupe',
      estimated_end_time = NULL
  WHERE id = p_machine_id;

  RETURN json_build_object(
    'transaction_id', v_transaction_id,
    'machine_command_id', v_command_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transaction_and_start_machine(uuid, uuid, uuid, text, decimal, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_transaction_and_start_machine(uuid, uuid, uuid, text, decimal, text, text) TO authenticated;
