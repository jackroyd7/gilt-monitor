// Pure helpers for the price chart tools: moving averages, rebasing, range statistics.

export type Pt = [string, number];

/** Simple moving average over `n` closes, aligned with the input (undefined until there are n). */
export function sma(points: Pt[], n: number): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  let sum = 0;
  points.forEach(([, v], i) => {
    sum += v;
    if (i >= n) sum -= points[i - n][1];
    out.push(i >= n - 1 ? sum / n : undefined);
  });
  return out;
}

/** The value on or before each date in `dates`, from another series (carried forward over gaps). */
export function alignTo(dates: string[], series: Pt[]): (number | undefined)[] {
  let j = -1;
  return dates.map((d) => {
    while (j + 1 < series.length && series[j + 1][0] <= d) j++;
    return j >= 0 ? series[j][1] : undefined;
  });
}

/** % change from `from` to `to`. */
export const pctChange = (from: number, to: number) => (to / from - 1) * 100;

export interface RangeStats {
  change: number;
  high: number;
  low: number;
  /** Largest peak-to-trough fall, % (negative). */
  maxDrawdown: number;
  /** Annualised volatility of daily returns, %. */
  vol?: number;
  /** Annualised return, % (only for spans over ~3 months). */
  annualised?: number;
  days: number;
}

export function rangeStats(points: Pt[]): RangeStats | null {
  if (points.length < 2) return null;
  const first = points[0][1];
  const last = points[points.length - 1][1];
  let high = -Infinity;
  let low = Infinity;
  let peak = -Infinity;
  let dd = 0;
  const rets: number[] = [];
  points.forEach(([, v], i) => {
    high = Math.max(high, v);
    low = Math.min(low, v);
    peak = Math.max(peak, v);
    dd = Math.min(dd, v / peak - 1);
    if (i) rets.push(Math.log(v / points[i - 1][1]));
  });
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance =
    rets.reduce((a, b) => a + (b - mean) ** 2, 0) /
    Math.max(1, rets.length - 1);
  const days =
    (Date.parse(points[points.length - 1][0]) - Date.parse(points[0][0])) /
    86_400_000;
  return {
    change: pctChange(first, last),
    high,
    low,
    maxDrawdown: dd * 100,
    vol: rets.length >= 10 ? Math.sqrt(variance * 252) * 100 : undefined,
    annualised:
      days > 90 ? ((last / first) ** (365 / days) - 1) * 100 : undefined,
    days: Math.round(days),
  };
}

/** Start date for a range key, counting back from the last date. */
export function rangeStart(last: string, key: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) return "0000";
  if (key === "YTD") return `${Number(last.slice(0, 4)) - 1}-12-31`;
  const days: Record<string, number> = {
    "1M": 31,
    "3M": 92,
    "6M": 183,
    "1Y": 366,
    "2Y": 731,
    "3Y": 1096,
    "5Y": 1827,
  };
  const n = days[key];
  return n
    ? new Date(Date.parse(last) - n * 86_400_000).toISOString().slice(0, 10)
    : "0000";
}
