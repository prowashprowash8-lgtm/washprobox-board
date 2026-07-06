-- Corriger create_transaction_and_start_machine pour passer la machine en "occupe"
-- directement au paiement, sans avoir besoin d'une durée (estimated_end_time = NULL).
-- La libération se fait via l'optocoupleur (release_machine après 3 min d'arrêt).
-- Exécuter dans Supabase → SQL Editor → Run

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

  -- 1. Créer la transaction
  INSERT INTO transactions (user_id, machine_id, emplacement_id, amount, montant_centimes, payment_method, promo_code, status)
  VALUES (p_user_id, p_machine_id, p_emplacement_id, p_amount, v_centimes, p_payment_method, p_promo_code, 'completed')
  RETURNING id INTO v_transaction_id;

  -- 2. Créer la commande START pour l'ESP32
  INSERT INTO machine_commands (esp32_id, command, status, user_id, transaction_id)
  VALUES (p_esp32_id, 'START', 'pending', p_user_id, v_transaction_id)
  RETURNING id INTO v_command_id;

  UPDATE transactions SET machine_command_id = v_command_id WHERE id = v_transaction_id;

  -- 3. Passer la machine en "occupe" immédiatement (pas de durée, l'opto libérera)
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
