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
  status?: string;
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

/** Début / fin de journée locale (évite les décalages UTC vs calendrier affiché). */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * Fenêtre calendaire locale pour les graphiques (hier / ce mois / cette année visibles correctement).
 */
export function getRevenueDisplayBounds(periode: Periode): { chartStart: Date; chartEnd: Date } {
  const now = new Date();
  if (periode === 'jour') {
    const chartStart = startOfLocalDay(now);
    const chartEnd = endOfLocalDay(now);
    return { chartStart, chartEnd };
  }
  if (periode === 'mois') {
    const chartStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const chartEnd = endOfLocalDay(now);
    return { chartStart, chartEnd };
  }
  const chartStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
  const chartEnd = endOfLocalDay(now);
  return { chartStart, chartEnd };
}

/**
 * Plage ISO pour Supabase : ±1 jour autour de la fenêtre affichée pour ne pas perdre de lignes
 * à la frontière UTC (sinon « hier » peut manquer dans la requête tout en étant dans l’onglet Transactions).
 */
export function getRevenueQueryIsoRange(periode: Periode): {
  startIso: string;
  endIso: string;
  chartStart: Date;
  chartEnd: Date;
} {
  const { chartStart, chartEnd } = getRevenueDisplayBounds(periode);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const queryStart = new Date(chartStart.getTime() - DAY_MS);
  const queryEnd = new Date(chartEnd.getTime() + DAY_MS);
  return {
    startIso: queryStart.toISOString(),
    endIso: queryEnd.toISOString(),
    chartStart,
    chartEnd,
  };
}

/** Garde uniquement les transactions dont l’instant tombe dans la fenêtre locale affichée. */
export function filterTransactionsForChartWindow(
  rows: TxRow[],
  chartStart: Date,
  chartEnd: Date,
  periode: Periode
): TxRow[] {
  return rows.filter((row) => {
    const t = new Date(row.created_at ?? '');
    if (Number.isNaN(t.getTime())) return false;
    if (periode === 'jour') {
      return (
        t.getFullYear() === chartStart.getFullYear() &&
        t.getMonth() === chartStart.getMonth() &&
        t.getDate() === chartStart.getDate()
      );
    }
    return t.getTime() >= chartStart.getTime() && t.getTime() <= chartEnd.getTime();
  });
}

/** Tests et remboursements exclus. */
export function filterTxForRevenue(rows: TxRow[]): TxRow[] {
  return rows.filter(
    (r) => r.payment_method !== 'test' && String(r.status ?? '').toLowerCase() !== 'refunded'
  );
}

/**
 * Revenus en € (carte, portefeuille, etc.) — hors code promo gratuit,
 * aligné sur le « Total affiché » de l’onglet Transactions.
 */
export function filterTxForMoneyRevenue(rows: TxRow[]): TxRow[] {
  return filterTxForRevenue(rows).filter((r) => r.payment_method !== 'promo');
}

/** @deprecated utiliser filterTxForRevenue */
export function filterTxSansTest(rows: TxRow[]): TxRow[] {
  return filterTxForRevenue(rows);
}

export function sumRevenue(rows: TxRow[]): number {
  return filterTxForMoneyRevenue(rows).reduce(
    (sum, row) => sum + Number(row.montant ?? row.amount ?? 0),
    0
  );
}

function localDateKey(d: Date, periode: Periode): string {
  if (periode === 'jour') {
    return `${String(d.getHours()).padStart(2, '0')}:00`;
  }
  if (periode === 'mois') {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Courbe des revenus : uniquement l’argent réel (hors promo gratuit).
 * Remplit tous les créneaux de la période (chaque jour / heure / mois) pour que rien ne manque sur le graphique.
 */
export function buildChartData(
  rows: TxRow[],
  periode: Periode,
  bounds?: { start: Date; end: Date }
): ChartPoint[] {
  const range = bounds ?? getPeriodBounds(periode);
  const moneyRows = filterTxForMoneyRevenue(rows);
  const byKey: Record<string, number> = {};
  moneyRows.forEach((row) => {
    const d = new Date(row.created_at ?? '');
    const key = localDateKey(d, periode);
    byKey[key] = (byKey[key] ?? 0) + Number(row.montant ?? row.amount ?? 0);
  });

  if (periode === 'jour') {
    const out: ChartPoint[] = [];
    for (let h = 0; h < 24; h++) {
      const key = `${String(h).padStart(2, '0')}:00`;
      const montant = byKey[key] ?? 0;
      out.push({ date: key, label: key, montant });
    }
    return out;
  }

  if (periode === 'mois') {
    const out: ChartPoint[] = [];
    const d = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
    const endD = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
    while (d <= endD) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;
      const montant = byKey[key] ?? 0;
      const label = new Date(d.getTime()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      out.push({ date: key, label, montant });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  const out: ChartPoint[] = [];
  const y0 = range.start.getFullYear();
  const y1 = range.end.getFullYear();
  const m0 = range.start.getMonth();
  const m1 = range.end.getMonth();
  for (let y = y0; y <= y1; y++) {
    const startM = y === y0 ? m0 : 0;
    const endM = y === y1 ? m1 : 11;
    for (let mo = startM; mo <= endM; mo++) {
      const key = `${y}-${String(mo + 1).padStart(2, '0')}`;
      const montant = byKey[key] ?? 0;
      const label = new Date(y, mo, 15).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      out.push({ date: key, label, montant });
    }
  }
  return out;
}

export function revenueByMachine(rows: TxRow[], machineIds: Set<string>): Record<string, number> {
  const revenus: Record<string, number> = {};
  filterTxForMoneyRevenue(rows).forEach((t) => {
    const mid = t.machine_id;
    if (!mid || !machineIds.has(mid)) return;
    revenus[mid] = (revenus[mid] ?? 0) + Number(t.montant ?? t.amount ?? 0);
  });
  return revenus;
}
