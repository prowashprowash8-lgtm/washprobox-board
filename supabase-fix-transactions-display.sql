-- Corriger l'affichage des transactions (app + board)
-- Exécuter dans Supabase → SQL Editor

-- 1. get_user_transactions : support name ET nom pour machines/emplacements
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
  emplacement_name text
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
    COALESCE(m.name, m.nom)::text AS machine_name,
    COALESCE(e.name, e.nom)::text AS emplacement_name
  FROM transactions t
  JOIN machines m ON m.id = t.machine_id
  LEFT JOIN emplacements e ON e.id = t.emplacement_id
  WHERE t.user_id = p_user_id
  ORDER BY t.created_at DESC;
END;
$$;

-- 2. get_all_transactions : pour le board (liste toutes les transactions avec détails)
CREATE OR REPLACE FUNCTION public.get_all_transactions()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  machine_id uuid,
  emplacement_id uuid,
  amount decimal,
  payment_method text,
  promo_code text,
  status text,
  created_at timestamptz,
  machine_name text,
  emplacement_name text,
  user_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.user_id,
    t.machine_id,
    t.emplacement_id,
    t.amount,
    t.payment_method,
    t.promo_code,
    t.status,
    t.created_at,
    COALESCE(m.name, m.nom)::text AS machine_name,
    COALESCE(e.name, e.nom)::text AS emplacement_name,
    COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      p.email
    ) AS user_name
  FROM transactions t
  LEFT JOIN machines m ON m.id = t.machine_id
  LEFT JOIN emplacements e ON e.id = t.emplacement_id
  LEFT JOIN profiles p ON p.id = t.user_id
  ORDER BY t.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_transactions(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_transactions() TO anon;
