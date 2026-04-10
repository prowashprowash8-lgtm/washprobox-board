-- ============================================================
-- DEMANDES DE REMBOURSEMENT
-- Exécuter dans Supabase → SQL Editor → Run
-- ============================================================

-- 1. Table refund_requests
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  user_id        uuid,
  motif          text NOT NULL,
  statut         text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  admin_note     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes policies si elles existent
DROP POLICY IF EXISTS "user_select_own_refunds" ON public.refund_requests;
DROP POLICY IF EXISTS "user_insert_own_refunds" ON public.refund_requests;
DROP POLICY IF EXISTS "service_all_refunds" ON public.refund_requests;

-- Tout autoriser (la sécurité est gérée dans la RPC SECURITY DEFINER)
CREATE POLICY "allow_all_refunds" ON public.refund_requests
  FOR ALL USING (true) WITH CHECK (true);

-- 3. RPC : créer une demande de remboursement (app)
CREATE OR REPLACE FUNCTION public.create_refund_request(
  p_transaction_id uuid,
  p_user_id uuid,
  p_motif text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_transaction_id IS NULL OR p_user_id IS NULL OR trim(p_motif) = '' THEN
    RETURN false;
  END IF;

  -- Vérifier qu'il n'y a pas déjà une demande pending pour cette transaction
  IF EXISTS (
    SELECT 1 FROM refund_requests
    WHERE transaction_id = p_transaction_id AND statut = 'pending'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO refund_requests (transaction_id, user_id, motif)
  VALUES (p_transaction_id, p_user_id, trim(p_motif));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_refund_request(uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_refund_request(uuid, uuid, text) TO authenticated;
