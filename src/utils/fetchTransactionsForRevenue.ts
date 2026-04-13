import type { SupabaseClient } from '@supabase/supabase-js';
import type { TxRow } from './revenueStats';
import { fetchAllTransactionsBoard, type RpcTransactionRow } from './fetchAllTransactionsBoard';

/**
 * Même source que l’onglet Transactions : RPC get_all_transactions (SECURITY DEFINER).
 * Un SELECT direct sur public.transactions peut renvoyer 0 ligne si le client est « anon »
 * (board sans JWT Supabase Auth) alors que la RPC est autorisée pour anon.
 */
function rpcRowToTxRow(t: RpcTransactionRow): TxRow {
  const amount = t.amount != null ? Number(t.amount) : undefined;
  return {
    machine_id: t.machine_id as string | undefined,
    montant: amount,
    amount,
    payment_method: t.payment_method as string | undefined,
    status: t.status as string | undefined,
    created_at: t.created_at as string | undefined,
  };
}

/**
 * Charge les transactions sur une plage [startIso, endIso] (inclus),
 * optionnellement limitées à certaines machines — aligné sur les données visibles dans Transactions.
 */
export async function fetchTransactionsForRevenue(
  supabase: SupabaseClient,
  opts: { startIso: string; endIso: string; machineIds?: string[] }
): Promise<TxRow[]> {
  const all = await fetchAllTransactionsBoard(supabase);
  const tStart = new Date(opts.startIso).getTime();
  const tEnd = new Date(opts.endIso).getTime();
  const machineFilter = opts.machineIds?.length ? new Set(opts.machineIds) : null;

  const out: TxRow[] = [];
  for (const raw of all) {
    const created = raw.created_at ? new Date(String(raw.created_at)).getTime() : NaN;
    if (Number.isNaN(created) || created < tStart || created > tEnd) continue;
    if (machineFilter) {
      const mid = raw.machine_id != null ? String(raw.machine_id) : '';
      if (!mid || !machineFilter.has(mid)) continue;
    }
    out.push(rpcRowToTxRow(raw));
  }

  return out;
}
