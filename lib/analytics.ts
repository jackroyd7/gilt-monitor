// Derived numbers for the pages. All cross-curve arithmetic first converts each rate to a
// semi-annual basis so a BoE zero, a Bundesbank zero and a UST par yield are compared like
// for like on compounding. (Zero vs par shape differences remain; see README.)

import { giltModDuration } from "./bond";
import { addDays, dateOnOrBefore, interpolate, latestDate, sortedDates, toSemiannual, yearsBetween } from "./curve";
import { fitNelsonSiegel, nsValue } from "./fit";
import type { CurveId, CurveSet, Gilt, GiltSnapshot } from "./types";

type Curves = Partial<Record<CurveId, CurveSet>>;

export function rateSA(set: CurveSet | undefined, date: string | undefined, t: number): number | null {
  if (!set || !date) return null;
  const row = set.rows[date];
  if (!row) return null;
  const v = interpolate(set.tenors, row, t);
  return v == null ? null : toSemiannual(v, set.basis);
}

/** A named quantity we can evaluate on any date: a rate, a spread or a curve slope. */
export interface Metric {
  key: string;
  label: string;
  unit: "pct" | "bp";
  /** Value on a date, or null if any input is missing. */
  at: (date: string) => number | null;
  /** Curves whose dates drive this metric's history. */
  base: CurveSet | undefined;
}

export function rateMetric(curves: Curves, id: CurveId, t: number, label: string): Metric {
  const set = curves[id];
  return { key: `${id}:${t}`, label, unit: "pct", base: set, at: (d) => rateSA(set, d, t) };
}

export function spreadMetric(
  curves: Curves,
  a: [CurveId, number],
  b: [CurveId, number],
  label: string,
): Metric {
  const sa = curves[a[0]];
  const sb = curves[b[0]];
  return {
    key: `${a.join(":")}-${b.join(":")}`,
    label,
    unit: "bp",
    base: sa,
    at: (d) => {
      const x = rateSA(sa, d, a[1]);
      // Other markets may not have printed on this exact date (holidays, time zones).
      const db = sb ? dateOnOrBefore(sb, d) : undefined;
      const y = db && db >= addDays(d, -4) ? rateSA(sb, db, b[1]) : null;
      return x == null || y == null ? null : (x - y) * 100;
    },
  };
}

export interface Tile {
  key: string;
  label: string;
  unit: "pct" | "bp";
  value: number | null;
  date?: string;
  chg1d: number | null; // bp
  chg1w: number | null; // bp
  spark: [string, number][];
}

export function metricSeries(m: Metric, fromDate?: string): [string, number][] {
  if (!m.base) return [];
  const out: [string, number][] = [];
  for (const d of sortedDates(m.base)) {
    if (fromDate && d < fromDate) continue;
    const v = m.at(d);
    if (v != null) out.push([d, v]);
  }
  return out;
}

export function tile(m: Metric): Tile {
  const series = metricSeries(m);
  const last = series[series.length - 1];
  const toBp = (a: number, b: number) => (m.unit === "pct" ? (a - b) * 100 : a - b);
  const prev = series[series.length - 2];
  const weekAgo = last ? [...series].reverse().find(([d]) => d <= addDays(last[0], -7)) : undefined;
  return {
    key: m.key,
    label: m.label,
    unit: m.unit,
    value: last?.[1] ?? null,
    date: last?.[0],
    chg1d: last && prev ? toBp(last[1], prev[1]) : null,
    chg1w: last && weekAgo ? toBp(last[1], weekAgo[1]) : null,
    spark: last ? series.filter(([d]) => d >= addDays(last[0], -92)) : [],
  };
}

export function headlineMetrics(c: Curves): Metric[] {
  return [
    rateMetric(c, "uk_nominal", 2, "Gilt 2y"),
    rateMetric(c, "uk_nominal", 10, "Gilt 10y"),
    rateMetric(c, "uk_nominal", 30, "Gilt 30y"),
    spreadMetric(c, ["uk_nominal", 10], ["uk_nominal", 2], "2s10s"),
    spreadMetric(c, ["uk_nominal", 30], ["uk_nominal", 10], "10s30s"),
    rateMetric(c, "uk_real", 10, "Real 10y"),
    rateMetric(c, "uk_inflation", 10, "RPI breakeven 10y"),
    spreadMetric(c, ["uk_nominal", 5], ["uk_ois", 5], "Gilt − SONIA OIS 5y"),
    spreadMetric(c, ["uk_nominal", 10], ["de_bund", 10], "Gilt − Bund 10y"),
    spreadMetric(c, ["uk_nominal", 10], ["us_ust", 10], "Gilt − UST 10y"),
  ];
}

/** Curve snapshot as chart points for a list of comparison dates. */
export function curveOnDates(set: CurveSet | undefined, dates: (string | undefined)[], maxT = 40) {
  if (!set) return [];
  return dates.map((d) => ({
    date: d,
    points: d && set.rows[d]
      ? set.tenors
          .map((t, i) => ({ t, v: set.rows[d][i] }))
          .filter((p): p is { t: number; v: number } => p.v != null && p.t <= maxT)
          .map((p) => ({ t: p.t, v: toSemiannual(p.v, set.basis) }))
      : [],
  }));
}

export const COMPARE_OFFSETS: { key: string; label: string; days: number }[] = [
  { key: "0", label: "Latest", days: 0 },
  { key: "1w", label: "1 week ago", days: 7 },
  { key: "1m", label: "1 month ago", days: 30 },
  { key: "3m", label: "3 months ago", days: 91 },
  { key: "1y", label: "1 year ago", days: 365 },
];

export function comparisonDates(set: CurveSet | undefined, keys: string[]) {
  const last = latestDate(set);
  if (!set || !last) return [];
  return COMPARE_OFFSETS.filter((o) => keys.includes(o.key)).map((o) => ({
    ...o,
    date: o.days ? dateOnOrBefore(set, addDays(last, -o.days)) : last,
  }));
}

// ---------------------------------------------------------------- per-gilt analytics

export interface GiltRow extends Gilt {
  years: number;
  modDuration: number | null;
  fitted: number | null;
  richCheap: number | null; // bp, yield minus fitted; positive = cheap
  oisSpread: number | null; // bp vs SONIA OIS at matched maturity (asset-swap proxy)
  bundSpread: number | null; // bp vs Bund at matched maturity
  ustSpread: number | null; // bp vs UST at matched maturity
}

export function giltRows(snap: GiltSnapshot | undefined, c: Curves) {
  if (!snap) return { rows: [] as GiltRow[], fit: null, asOf: undefined };
  const asOf = snap.asOf;
  const conv = snap.gilts.filter((g) => g.type === "conventional" && g.yield != null);
  const fitPts = conv
    .map((g) => ({ t: yearsBetween(asOf, g.maturity), y: g.yield as number }))
    .filter((p) => p.t > 0.5);
  const fit = fitNelsonSiegel(fitPts);

  const near = (set: CurveSet | undefined) => {
    const d = set ? dateOnOrBefore(set, asOf) : undefined;
    return d && d >= addDays(asOf, -5) ? d : undefined;
  };
  const dOis = near(c.uk_ois);
  const dBund = near(c.de_bund);
  const dUst = near(c.us_ust);
  const spread = (y: number | null, set: CurveSet | undefined, d: string | undefined, t: number) => {
    const r = rateSA(set, d, t);
    return y == null || r == null ? null : (y - r) * 100;
  };

  const rows: GiltRow[] = snap.gilts.map((g) => {
    const years = yearsBetween(asOf, g.maturity);
    const isConv = g.type === "conventional";
    const fitted = isConv && fit && years > 0.5 ? nsValue(fit, years) : null;
    return {
      ...g,
      years,
      modDuration:
        isConv && g.coupon != null && g.yield != null ? giltModDuration(g.coupon, g.maturity, asOf, g.yield) : null,
      fitted,
      richCheap: fitted != null && g.yield != null ? (g.yield - fitted) * 100 : null,
      oisSpread: isConv ? spread(g.yield, c.uk_ois, dOis, years) : null,
      bundSpread: isConv ? spread(g.yield, c.de_bund, dBund, years) : null,
      ustSpread: isConv ? spread(g.yield, c.us_ust, dUst, years) : null,
    };
  });
  return { rows, fit, asOf };
}
