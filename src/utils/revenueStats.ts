export type Periode = 'jour' | 'mois' | 'annee';

export interface ChartPoint {
  date: string;
  label: string;
  montant: number;
}

export interface TxRow {
  machine_id?: string;
  montant?: number;
  amount?: number;
  payment_method?: string;
  created_at?: string;
}

export const PERIODE_LABELS: Record<Periode, string> = {
  jour: "Aujourd'hui",
  mois: 'Ce mois',
  annee: "Cette année",
};

export function getPeriodBounds(periode: Periode): { start: Date; end: Date } {
  const now = new Date();
  let startDate: Date;
  if (periode === 'jour') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (periode === 'mois') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    startDate = new Date(now.getFullYear(), 0, 1);
  }
  return { start: startDate, end: now };
}

export function filterTxSansTest(rows: TxRow[]): TxRow[] {
  return rows.filter((r) => r.payment_method !== 'test');
}

export function sumRevenue(rows: TxRow[]): number {
  return filterTxSansTest(rows).reduce((sum, row) => sum + Number(row.montant ?? row.amount ?? 0), 0);
}

export function buildChartData(rows: TxRow[], periode: Periode): ChartPoint[] {
  const rowsSansTest = filterTxSansTest(rows);
  const byKey: Record<string, number> = {};
  rowsSansTest.forEach((row) => {
    const d = new Date(row.created_at ?? '');
    let key: string;
    if (periode === 'jour') {
      key = `${String(d.getHours()).padStart(2, '0')}:00`;
    } else if (periode === 'mois') {
      key = d.toISOString().slice(0, 10);
    } else {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    byKey[key] = (byKey[key] ?? 0) + Number(row.montant ?? row.amount ?? 0);
  });

  return Object.entries(byKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, montant]) => {
      let label: string;
      if (periode === 'jour') {
        label = date;
      } else if (periode === 'mois') {
        label = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      } else {
        label = new Date(date + '-01T12:00:00').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      }
      return { date, label, montant };
    });
}

export function revenueByMachine(rows: TxRow[], machineIds: Set<string>): Record<string, number> {
  const revenus: Record<string, number> = {};
  filterTxSansTest(rows).forEach((t) => {
    const mid = t.machine_id;
    if (!mid || !machineIds.has(mid)) return;
    revenus[mid] = (revenus[mid] ?? 0) + Number(t.montant ?? t.amount ?? 0);
  });
  return revenus;
}
