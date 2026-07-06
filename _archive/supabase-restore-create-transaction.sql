-- Rétablir create_transaction_and_start_machine (table transactions EXISTANTE)
-- Exécuter dans Supabase → SQL Editor → Coller → Run

-- 1. Ajouter les colonnes manquantes à transactions
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS machine_id uuid REFERENCES public.machines(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS emplacement_id uuid REFERENCES public.emplacements(id) ON DELETE CASCADE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS amount decimal(10,2) DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS montant_centimes integer DEFAULT 0;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'promo';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS machine_command_id uuid;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS refund_reason text;

-- 2. Colonnes machine_commands
ALTER TABLE public.machine_commands ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.machine_commands ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.transactions(id);

-- 3. Policy INSERT anon sur machine_commands
DROP POLICY IF EXISTS "Anon can insert commands" ON public.machine_commands;
CREATE POLICY "Anon can insert commands"
  ON public.machine_commands FOR INSERT TO anon WITH CHECK (true);

-- 4. RPC create_transaction_and_start_machine
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
BEGIN
  INSERT INTO transactions (user_id, machine_id, emplacement_id, amount, montant_centimes, payment_method, promo_code, status)
  VALUES (p_user_id, p_machine_id, p_emplacement_id, p_amount, GREATEST(0, COALESCE(ROUND(p_amount * 100)::integer, 0)), p_payment_method, p_promo_code, 'completed')
  RETURNING id INTO v_transaction_id;

  INSERT INTO machine_commands (esp32_id, command, status, user_id, transaction_id)
  VALUES (p_esp32_id, 'START', 'pending', p_user_id, v_transaction_id)
  RETURNING id INTO v_command_id;

  UPDATE transactions SET machine_command_id = v_command_id WHERE id = v_transaction_id;

  RETURN json_build_object(
    'transaction_id', v_transaction_id,
    'machine_command_id', v_command_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transaction_and_start_machine(uuid, uuid, uuid, text, decimal, text, text) TO anon;
