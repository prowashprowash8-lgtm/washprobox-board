-- Stats portefeuille pour le board (solde actuel + total des recharges Stripe)
-- Exécuter dans Supabase → SQL Editor (une fois)

CREATE OR REPLACE FUNCTION public.get_user_wallet_stats(p_user_id uuid)
RETURNS TABLE (
  wallet_balance_centimes integer,
  total_recharged_centimes bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce((SELECT p.wallet_balance FROM public.profiles p WHERE p.id = p_user_id), 0)::integer,
    coalesce(
      (
        SELECT sum(wt.amount_centimes)::bigint
        FROM public.wallet_transactions wt
        WHERE wt.user_id = p_user_id
          AND wt.type = 'recharge'
      ),
      0::bigint
    );
$$;

REVOKE ALL ON FUNCTION public.get_user_wallet_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_wallet_stats(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_wallet_stats(uuid) TO authenticated;
