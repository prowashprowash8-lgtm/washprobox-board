-- WashPro board : get_all_transactions avec pagination (évite la troncature ~1000 lignes de PostgREST)
-- Exécuter dans Supabase → SQL Editor → Run une fois.

-- Ancienne signature sans paramètres
DROP FUNCTION IF EXISTS public.get_all_transactions();

CREATE OR REPLACE FUNCTION public.get_all_transactions(
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 1000
)
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
DECLARE
  v_limit integer;
  v_offset integer;
BEGIN
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000);

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
    COALESCE(m.name, m.nom, '—')::text AS machine_name,
    COALESCE(e.name, e.nom, '—')::text AS emplacement_name,
    COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      p.email,
      '—'
    )::text AS user_name
  FROM transactions t
  LEFT JOIN machines m ON m.id = t.machine_id
  LEFT JOIN emplacements e ON e.id = t.emplacement_id
  LEFT JOIN profiles p ON p.id = t.user_id
  ORDER BY t.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_transactions(integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_transactions(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_transactions(integer, integer) TO service_role;
