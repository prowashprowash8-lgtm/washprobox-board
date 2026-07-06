-- WashPro : fiche client du dashboard (ProfileDetail.tsx) — transactions + activité
-- portefeuille d'un client donné, consultées par le staff patron.
--
-- Migration #2 de l'audit (2026-07-06) : régression trouvée pendant le nettoyage de la
-- migration auth mobile. ProfileDetail.tsx appelait get_user_transactions/
-- get_user_wallet_activity avec seulement p_user_id, une signature disparue quand on a
-- ajouté le session_token (#5/#6 de l'audit). Reconstruites ici en versions dédiées au
-- board (même principe que get_user_wallet_stats déjà en place : réservées au rôle patron
-- via board_account_roles — ce n'est pas l'utilisateur qui consulte ses propres données,
-- c'est le staff qui consulte celles d'un client). Coexistent sans conflit avec les
-- versions sans argument (app mobile, définies dans
-- refund-request-response-and-promo.sql / wallet.sql), Postgres distingue les deux par
-- le nombre d'arguments.

create or replace function public.get_user_transactions(p_user_id uuid)
returns table (
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
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.board_account_roles where user_id = auth.uid() and role = 'patron') then
    return;
  end if;

  return query
  select
    t.id,
    t.amount,
    t.payment_method,
    t.promo_code,
    t.status,
    t.created_at,
    t.refunded_at,
    t.refund_reason,
    m.name as machine_name,
    coalesce(e.name, e.nom) as emplacement_name,
    rr.statut as refund_request_statut,
    rr.compensation_promo_code as refund_compensation_code,
    rr.compensation_used as refund_compensation_used
  from public.transactions t
  join public.machines m on m.id = t.machine_id
  join public.emplacements e on e.id = t.emplacement_id
  left join lateral (
    select
      rr2.statut,
      rr2.compensation_promo_code,
      case
        when rr2.statut <> 'approved' or rr2.compensation_promo_code is null then null::boolean
        when pc.id is null then true
        when coalesce(pc.uses_remaining, 0) <= 0 then true
        else false
      end as compensation_used
    from public.refund_requests rr2
    left join public.promo_codes pc
      on upper(trim(pc.code)) = upper(trim(rr2.compensation_promo_code))
    where rr2.transaction_id = t.id
    order by rr2.created_at desc
    limit 1
  ) rr on true
  where t.user_id = p_user_id
  order by t.created_at desc;
end;
$$;

revoke all on function public.get_user_transactions(uuid) from public;
grant execute on function public.get_user_transactions(uuid) to authenticated;

create or replace function public.get_user_wallet_activity(p_user_id uuid)
returns table (
  id uuid,
  activity_kind text,
  amount_centimes integer,
  created_at timestamptz,
  ref_hint text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.board_account_roles where user_id = auth.uid() and role = 'patron') then
    return;
  end if;

  return query
  select
    wt.id,
    case wt.type
      when 'recharge' then 'wallet_recharge'
      when 'refund' then 'wallet_refund'
      when 'machine_debit' then 'wallet_machine_debit'
      else 'wallet_unknown'
    end as activity_kind,
    wt.amount_centimes,
    wt.created_at,
    left(
      trim(
        coalesce(
          nullif(trim(wt.stripe_refund_id), ''),
          nullif(trim(wt.stripe_session_id), ''),
          nullif(trim(wt.stripe_payment_intent_id), ''),
          ''
        )
      ),
      64
    ) as ref_hint
  from public.wallet_transactions wt
  where wt.user_id = p_user_id
  order by wt.created_at desc;
end;
$$;

revoke all on function public.get_user_wallet_activity(uuid) from public;
grant execute on function public.get_user_wallet_activity(uuid) to authenticated;
