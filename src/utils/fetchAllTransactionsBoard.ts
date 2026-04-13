import type { SupabaseClient } from '@supabase/supabase-js';

/** PostgREST / Supabase plafonne souvent les réponses à ~1000 lignes : on enchaîne les pages. */
const PAGE_SIZE = 1000;

export type RpcTransactionRow = Record<string, unknown>;

/**
 * Charge toutes les transactions visibles par get_all_transactions (SECURITY DEFINER).
 * Utilise p_offset / p_limit si la fonction SQL est à jour ; sinon un seul appel (ancienne RPC).
 */
export async function fetchAllTransactionsBoard(supabase: SupabaseClient): Promise<RpcTransactionRow[]> {
  const merged: RpcTransactionRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.rpc('get_all_transactions', {
      p_offset: offset,
      p_limit: PAGE_SIZE,
    });

    if (error) {
      const msg = error.message ?? '';
      const isMissingRpc =
        offset === 0 &&
        (msg.includes('does not exist') ||
          msg.includes('function public.get_all_transactions') ||
          (error as { code?: string }).code === '42883');
      if (isMissingRpc) {
        const { data: legacy, error: legacyErr } = await supabase.rpc('get_all_transactions');
        if (legacyErr) throw legacyErr;
        return (legacy ?? []) as RpcTransactionRow[];
      }
      throw error;
    }

    const chunk = (data ?? []) as RpcTransactionRow[];
    merged.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return merged;
}
