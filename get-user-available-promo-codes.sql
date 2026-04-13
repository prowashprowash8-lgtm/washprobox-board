-- Codes promo compensation encore utilisables + type (lavage | sechage | both)
-- Si changement de signature : DROP obligatoire.
-- Exécuter dans Supabase → SQL Editor

DROP FUNCTION IF EXISTS public.get_user_available_promo_codes(uuid);

CREATE OR REPLACE FUNCTION public.get_user_available_promo_codes(p_user_id uuid)
RETURNS TABLE (
  code text,
  uses_remaining integer,
  applies_to text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (pc.code)
    pc.code,
    COALESCE(pc.uses_remaining, 0)::integer,
    lower(trim(coalesce(pc.applies_to, 'both')))
  FROM public.refund_requests rr
  INNER JOIN public.promo_codes pc
    ON upper(trim(pc.code)) = upper(trim(rr.compensation_promo_code))
  WHERE rr.user_id = p_user_id
    AND rr.statut = 'approved'
    AND rr.compensation_promo_code IS NOT NULL
    AND COALESCE(pc.uses_remaining, 0) > 0
  ORDER BY pc.code;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_available_promo_codes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_available_promo_codes(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_available_promo_codes(uuid) TO authenticated;
