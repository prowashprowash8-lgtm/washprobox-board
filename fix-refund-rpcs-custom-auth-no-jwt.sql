-- ============================================================
-- CORRECTIF : badge Activité + codes promo au paiement
--
-- L’app WashPro se connecte via RPC sign_in (profiles), pas via Supabase Auth.
-- Donc auth.uid() est TOUJOURS NULL : les RPC qui vérifiaient auth.uid() = p_user_id
-- ne renvoyaient rien (badge 0, liste vide, erreur not_allowed).
--
-- Ce script aligne le comportement sur get_user_transactions (p_user_id seul).
-- Exécuter UNE FOIS dans Supabase → SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.count_unseen_refund_responses(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN (
    SELECT count(*)::integer
    FROM public.refund_requests
    WHERE user_id = p_user_id
      AND statut IN ('approved', 'rejected')
      AND response_seen_at IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.count_unseen_refund_responses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unseen_refund_responses(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.count_unseen_refund_responses(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_refund_responses_seen(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.refund_requests
  SET response_seen_at = now()
  WHERE user_id = p_user_id
    AND statut IN ('approved', 'rejected')
    AND response_seen_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_refund_responses_seen(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_refund_responses_seen(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_refund_responses_seen(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_available_promo_codes(p_user_id uuid)
RETURNS TABLE (
  code text,
  uses_remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    pc.code,
    COALESCE(pc.uses_remaining, 0)::integer
  FROM public.refund_requests rr
  INNER JOIN public.promo_codes pc
    ON upper(trim(pc.code)) = upper(trim(rr.compensation_promo_code))
  WHERE rr.user_id = p_user_id
    AND rr.statut = 'approved'
    AND rr.compensation_promo_code IS NOT NULL
    AND COALESCE(pc.uses_remaining, 0) > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_available_promo_codes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_available_promo_codes(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_available_promo_codes(uuid) TO authenticated;
