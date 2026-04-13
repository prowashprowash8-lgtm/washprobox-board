-- Mes transactions : savoir si le code compensation est déjà consommé (uses_remaining = 0)
-- → affichage rouge dans l’app.
-- Exécuter dans Supabase → SQL Editor (une fois)

DROP FUNCTION IF EXISTS public.get_user_transactions(uuid);

CREATE OR REPLACE FUNCTION public.get_user_transactions(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  amount decimal,
  payment_method text,
  promo_code text,
  status text,
  created_at timestamptz,
  refunded_at timestamptz,
  refund_reason text,
  machine_name text,
  emplacement_name text,
  refund_request_statut text,
  refund_compensation_code text,
  refund_compensation_used boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.amount,
    t.payment_method,
    t.promo_code,
    t.status,
    t.created_at,
    t.refunded_at,
    t.refund_reason,
    m.name AS machine_name,
    COALESCE(e.name, e.nom) AS emplacement_name,
    rr.statut AS refund_request_statut,
    rr.compensation_promo_code AS refund_compensation_code,
    rr.compensation_used AS refund_compensation_used
  FROM public.transactions t
  JOIN public.machines m ON m.id = t.machine_id
  JOIN public.emplacements e ON e.id = t.emplacement_id
  LEFT JOIN LATERAL (
    SELECT
      rr2.statut,
      rr2.compensation_promo_code,
      CASE
        WHEN rr2.statut <> 'approved' OR rr2.compensation_promo_code IS NULL THEN NULL::boolean
        WHEN pc.id IS NULL THEN true
        WHEN COALESCE(pc.uses_remaining, 0) <= 0 THEN true
        ELSE false
      END AS compensation_used
    FROM public.refund_requests rr2
    LEFT JOIN public.promo_codes pc
      ON upper(trim(pc.code)) = upper(trim(rr2.compensation_promo_code))
    WHERE rr2.transaction_id = t.id
    ORDER BY rr2.created_at DESC
    LIMIT 1
  ) rr ON true
  WHERE t.user_id = p_user_id
  ORDER BY t.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_transactions(uuid) TO anon;
