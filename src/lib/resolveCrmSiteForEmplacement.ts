import type { SupabaseClient } from '@supabase/supabase-js';

export type ResolveCrmSiteResult = {
  crmSiteId: string | null;
  linkUpsertError: string | null;
};

/**
 * Trouve l'identifiant laverie CRM (historique.laverie_id) pour un emplacement board :
 * 1) table crm_laverie_links
 * 2) correspondance nom + adresse sur laveries, puis enregistrement du lien
 * 3) correspondance nom seul (dernière laverie), puis enregistrement du lien
 */
export async function resolveCrmSiteIdForEmplacement(
  supabase: SupabaseClient,
  emplacementId: string,
  empName: string | null | undefined,
  empAddress: string | null | undefined
): Promise<ResolveCrmSiteResult> {
  const linkRes = await supabase
    .from('crm_laverie_links')
    .select('crm_site_id')
    .eq('emplacement_id', emplacementId)
    .maybeSingle();

  if (linkRes.error) {
    return { crmSiteId: null, linkUpsertError: linkRes.error.message };
  }

  const fromLink = String(linkRes.data?.crm_site_id ?? '').trim();
  if (fromLink) {
    return { crmSiteId: fromLink, linkUpsertError: null };
  }

  const name = (empName ?? '').trim();
  const address = (empAddress ?? 'Adresse non renseignée').trim();

  const tryUpsertLink = async (crmSiteId: string): Promise<string | null> => {
    const { error: upsertErr } = await supabase.from('crm_laverie_links').upsert({
      emplacement_id: emplacementId,
      crm_site_id: crmSiteId,
      sync_status: 'synced',
      synced_at: new Date().toISOString(),
      last_error: null,
    });
    if (upsertErr) {
      return null;
    }
    return crmSiteId;
  };

  if (name) {
    const byNameAddr = await supabase
      .from('laveries')
      .select('id')
      .eq('nom', name)
      .eq('adresse', address)
      .maybeSingle();

    if (!byNameAddr.error && byNameAddr.data?.id) {
      const id = String(byNameAddr.data.id);
      const ok = await tryUpsertLink(id);
      return { crmSiteId: ok ?? id, linkUpsertError: ok ? null : 'Lien CRM non enregistré (droits ou RLS).' };
    }

    const byName = await supabase
      .from('laveries')
      .select('id')
      .eq('nom', name)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!byName.error && byName.data?.id) {
      const id = String(byName.data.id);
      const ok = await tryUpsertLink(id);
      return { crmSiteId: ok ?? id, linkUpsertError: ok ? null : 'Lien CRM non enregistré (droits ou RLS).' };
    }
  }

  const { data: ensured, error: ensureErr } = await supabase.rpc('ensure_crm_link_for_emplacement', {
    p_emplacement_id: emplacementId,
  });
  if (ensureErr) {
    return { crmSiteId: null, linkUpsertError: ensureErr.message };
  }
  if (ensured != null && String(ensured).trim() !== '') {
    return { crmSiteId: String(ensured).trim(), linkUpsertError: null };
  }

  return { crmSiteId: null, linkUpsertError: null };
}
