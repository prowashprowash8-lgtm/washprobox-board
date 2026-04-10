/** Aligné avec l’app mobile (colonne machines.machine_kind + fallback type). */
export type MachineKind = 'lavage' | 'sechage';

export function inferMachineKind(m: {
  machine_kind?: string | null;
  type?: string | null;
}): MachineKind {
  const k = String(m.machine_kind || '').toLowerCase().trim();
  if (k === 'sechage') return 'sechage';
  if (k === 'lavage') return 'lavage';
  const t = String(m.type || '').toLowerCase();
  if (
    t.includes('sechage') ||
    t.includes('dryer') ||
    t.includes('sèche') ||
    t.includes('seche')
  ) {
    return 'sechage';
  }
  return 'lavage';
}
