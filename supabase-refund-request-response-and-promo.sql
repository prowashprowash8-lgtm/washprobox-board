-- ============================================================
-- Remboursements : code promo à l'approbation + badge "vu" côté app
-- Exécuter dans Supabase → SQL Editor
-- ============================================================

ALTER TABLE public.refund_requests
  ADD COLUMN IF NOT EXISTS compensation_promo_code text,
  ADD COLUMN IF NOT EXISTS response_seen_at timestamptz;

ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS applies_to text DEFAULT 'both';

COMMENT ON COLUMN public.refund_requests.compensation_promo_code IS
  'Code promo unique généré lors de l''approbation (une utilisation).';
COMMENT ON COLUMN public.refund_requests.response_seen_at IS
  'Date à laquelle l''utilisateur a ouvert l''onglet Activité après la réponse (badge).';

-- Anciennes lignes déjà traitées : ne pas afficher de badge rétroactif
UPDATE public.refund_requests
SET response_seen_at = now()
WHERE statut IN ('approved', 'rejected')
  AND response_seen_at IS NULL;

-- ----------------------------------------------------------------
-- Décision board : approuve (code promo) ou refuse
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_or_reject_refund_request(
  p_request_id uuid,
  p_statut text,
  p_admin_note text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.refund_requests%rowtype;
  v_code text;
  v_inserted boolean;
  v_machine_id uuid;
  v_mk text;
  v_mt text;
  v_applies_to text;
BEGIN
  IF p_statut NOT IN ('approved', 'rejected') THEN
    RETURN json_build_object('success', false, 'error', 'invalid_status');
  END IF;

  SELECT * INTO v_row FROM public.refund_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'not_found');
  END IF;
  IF v_row.statut IS DISTINCT FROM 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'already_processed');
  END IF;

  v_code := NULL;
  IF p_statut = 'approved' THEN
    v_machine_id := NULL;
    v_mk := NULL;
    v_mt := NULL;
    v_applies_to := 'lavage';

    SELECT t.machine_id INTO v_machine_id FROM public.transactions t WHERE t.id = v_row.transaction_id;
    IF v_machine_id IS NOT NULL THEN
      SELECT lower(trim(coalesce(machine_kind, ''))), lower(coalesce(type, ''))
      INTO v_mk, v_mt
      FROM public.machines WHERE id = v_machine_id;
    END IF;

    IF v_mk IN ('lavage', 'sechage') THEN
      v_applies_to := v_mk;
    ELSE
      v_applies_to := CASE
        WHEN v_mt LIKE '%sechage%' OR v_mt LIKE '%dryer%' OR v_mt LIKE '%sèche%' OR v_mt LIKE '%seche%' OR v_mt LIKE '%dry%' THEN 'sechage'
        ELSE 'lavage'
      END;
    END IF;

    v_inserted := false;
    FOR v_i IN 1..30 LOOP
      v_code := 'REM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      BEGIN
        INSERT INTO public.promo_codes (code, uses_remaining, applies_to)
        VALUES (v_code, 1, v_applies_to);
        v_inserted := true;
        EXIT;
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
      END;
    END LOOP;
    IF NOT v_inserted THEN
      RETURN json_build_object('success', false, 'error', 'code_generation_failed');
    END IF;
  END IF;

  UPDATE public.refund_requests
  SET
    statut = p_statut,
    admin_note = NULLIF(trim(COALESCE(p_admin_note, '')), ''),
    compensation_promo_code = CASE WHEN p_statut = 'approved' THEN v_code ELSE NULL END,
    response_seen_at = NULL
  WHERE id = p_request_id;

  IF p_statut = 'approved' THEN
    RETURN json_build_object('success', true, 'compensation_promo_code', v_code);
  END IF;
  RETURN json_build_object('success', true, 'compensation_promo_code', null);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_or_reject_refund_request(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_or_reject_refund_request(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.approve_or_reject_refund_request(uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------
-- Compteur badge (réponses non lues)
-- Note : l’app mobile utilise sign_in RPC (pas de JWT Supabase Auth), donc auth.uid()
-- est NULL. On s’appuie sur p_user_id comme get_user_transactions (même modèle).
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- Marquer comme vues (ouverture onglet Activité)
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- Transactions utilisateur : infos demande de remboursement
-- (DROP + CREATE : PostgreSQL refuse de changer le type de retour avec CREATE OR REPLACE seul)
-- ----------------------------------------------------------------
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
GRANT EXECUTE ON FUNCTION public.get_user_transactions(uuid) TO authenticated;

-- ----------------------------------------------------------------
-- Codes promo disponibles au moment du paiement (modal app)
-- ----------------------------------------------------------------
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
