// Gilt relative value: forward curves, carry and roll-down, rich/cheap history against a
// daily fitted curve, and switch / butterfly z-scores. Pure functions over our data.

import { interpolate, toSemiannual, yearsBetween } from "./curve";
import { nsValue, robustFit, type NelsonSiegel } from "./fit";
import type { CurveSet, GiltHistory } from "./types";

type Point = [string, number];

// ---------------------------------------------------------------- forwards

/** Forward rate between t1 and t2 (years) from a continuously compounded zero curve, semi-annual %. */
export function forwardRate(set: CurveSet, date: string, t1: number, t2: number): number | null {
  const row = set.rows[date];
  if (!row) return null;
  const z2 = interpolate(set.tenors, row, t2);
  const z1 = t1 === 0 ? 0 : interpolate(set.tenors, row, t1);
  if (z2 == null || z1 == null) return null;
  return toSemiannual((z2 * t2 - z1 * t1) / (t2 - t1), set.basis);
}

/** The zero curve implied to hold `start` years from now: f(start, start + t) for each t. */
export function forwardStartingCurve(set: CurveSet, date: string, start: number, maxT = 30): [number, number][] {
  const out: [number, number][] = [];
  for (let t = 0.5; t <= maxT; t += 0.5) {
    const f = forwardRate(set, date, start, start + t);
    if (f != null) out.push([t, +f.toFixed(4)]);
  }
  return out;
}

/** 1-year forward rates f(t, t+1) along the curve: where the curve says 1-year rates will be. */
export function oneYearForwards(set: CurveSet, date: string, maxT = 29): [number, number][] {
  const out: [number, number][] = [];
  for (let t = 0; t <= maxT; t += 0.5) {
    const f = forwardRate(set, date, t, t + 1);
    if (f != null) out.push([t, +f.toFixed(4)]);
  }
  return out;
}

export const KEY_FORWARDS = [
  { label: "1y1y", start: 1, len: 1 },
  { label: "2y1y", start: 2, len: 1 },
  { label: "2y3y", start: 2, len: 3 },
  { label: "5y5y", start: 5, len: 5 },
  { label: "10y10y", start: 10, len: 10 },
  { label: "15y15y", start: 15, len: 15 },
  { label: "20y10y", start: 20, len: 10 },
  { label: "30y10y", start: 30, len: 10 },
];

// ---------------------------------------------------------------- carry and roll-down

export interface CarryRoll {
  /** Return from earning the yield over repo for the horizon, as % of price. */
  carryPct: number;
  /** Return from rolling down the fitted curve, as % of price. */
  rollPct: number;
  totalPct: number;
  /** The same in yield terms (bp): how far yields could rise over the horizon before the trade loses. */
  breakevenBp: number;
  carryBp: number;
  rollBp: number;
}

/**
 * Carry and roll-down for a gilt over `h` years with an unchanged curve.
 * carry ≈ (yield − repo) × h; roll ≈ (fit(T) − fit(T − h)) × duration.
 */
export function carryRoll(yieldPct: number, years: number, modDur: number, fit: NelsonSiegel, repoPct: number, h = 0.25): CarryRoll | null {
  if (years <= h + 0.25 || modDur <= 0) return null;
  const rollBp = (nsValue(fit, years) - nsValue(fit, years - h)) * 100;
  const carryPct = (yieldPct - repoPct) * h;
  const rollPct = (rollBp * modDur) / 100;
  const carryBp = (carryPct / modDur) * 100;
  return { carryPct, rollPct, totalPct: carryPct + rollPct, carryBp, rollBp, breakevenBp: carryBp + rollBp };
}

// ---------------------------------------------------------------- history-based screens

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};

/** z-score of the last point against the last `n` points (null if too little history). */
export function zScore(points: Point[], n: number): number | null {
  const xs = points.slice(-n).map((p) => p[1]);
  if (xs.length < Math.min(n, 40)) return null;
  const s = sd(xs);
  return s > 1e-9 ? (xs[xs.length - 1] - mean(xs)) / s : null;
}

/** Change in a series since `days` calendar days before its last point. */
export function changeSince(points: Point[], days: number): number | null {
  if (points.length < 2) return null;
  const [lastD, last] = points[points.length - 1];
  const from = new Date(Date.parse(lastD) - days * 86_400_000).toISOString().slice(0, 10);
  let base: number | null = null;
  for (const [d, v] of points) {
    if (d > from) break;
    base = v;
  }
  return base == null ? null : last - base;
}

/** Yield history per gilt (conventionals only), [date, yield %]. */
export function yieldHistories(hist: GiltHistory): Map<string, Point[]> {
  const out = new Map<string, Point[]>();
  for (const d of Object.keys(hist.rows).sort()) {
    for (const [isin, r] of Object.entries(hist.rows[d])) {
      if (hist.gilts[isin]?.type !== "conventional" || r[1] == null) continue;
      const list = out.get(isin) ?? [];
      list.push([d, r[1]]);
      out.set(isin, list);
    }
  }
  return out;
}

/** Each conventional gilt's yield minus a Nelson-Siegel curve fitted to that day's gilts, in bp. */
export function residualHistories(hist: GiltHistory): Map<string, Point[]> {
  const out = new Map<string, Point[]>();
  for (const d of Object.keys(hist.rows).sort()) {
    const pts = Object.entries(hist.rows[d]).flatMap(([isin, r]) => {
      const g = hist.gilts[isin];
      if (g?.type !== "conventional" || r[1] == null) return [];
      const t = yearsBetween(d, g.maturity);
      return t > 0.5 ? [{ isin, t, y: r[1] }] : [];
    });
    if (pts.length < 10) continue;
    const { fit, dropped } = robustFit(pts);
    if (!fit) continue;
    pts.forEach((p, i) => {
      if (dropped.has(i)) return;
      const list = out.get(p.isin) ?? [];
      list.push([d, +((p.y - nsValue(fit, p.t)) * 100).toFixed(2)]);
      out.set(p.isin, list);
    });
  }
  return out;
}

/** Series of a combination of yields on the dates all legs have, in bp: Σ weight × yield × 100. */
export function combo(legs: { series: Point[]; weight: number }[]): Point[] {
  const maps = legs.map((l) => new Map(l.series));
  return legs[0].series.flatMap(([d]) => {
    let v = 0;
    for (let i = 0; i < legs.length; i++) {
      const y = maps[i].get(d);
      if (y == null) return [];
      v += legs[i].weight * y * 100;
    }
    return [[d, +v.toFixed(2)] as Point];
  });
}

export interface Screen {
  id: string;
  label: string;
  legs: string[];
  value: number;
  chg1m: number | null;
  z3m: number | null;
  z1y: number | null;
  series: Point[];
}

/**
 * Switches (each gilt against the next few longer ones) and butterflies (2 × belly − wings,
 * on neighbouring and wider wings) among gilts with a full year of history, ranked by |z| (1y).
 */
export function screens(gilts: { isin: string; name: string; years: number }[], ys: Map<string, Point[]>) {
  const list = gilts.filter((g) => (ys.get(g.isin)?.length ?? 0) >= 120 && g.years > 1).sort((a, b) => a.years - b.years);
  const make = (legs: typeof list, weights: number[], label: string): Screen | null => {
    const series = combo(legs.map((g, i) => ({ series: ys.get(g.isin)!, weight: weights[i] })));
    if (series.length < 60) return null;
    return {
      id: legs.map((g) => g.isin).join("-"),
      label,
      legs: legs.map((g) => g.isin),
      value: series[series.length - 1][1],
      chg1m: changeSince(series, 31),
      z3m: zScore(series, 63),
      z1y: zScore(series, 252),
      series,
    };
  };
  const short = (n: string) => n.replace(/Treasury (Gilt|Stock)\s*/i, "").replace(/\s+/g, " ").trim();
  const switches: Screen[] = [];
  const flies: Screen[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j <= Math.min(i + 3, list.length - 1); j++) {
      const s = make([list[i], list[j]], [-1, 1], `${short(list[i].name)} → ${short(list[j].name)}`);
      if (s) switches.push(s);
    }
    for (const w of [1, 2]) {
      if (i + 2 * w >= list.length) continue;
      const [a, b, c] = [list[i], list[i + w], list[i + 2 * w]];
      const f = make([a, b, c], [-1, 2, -1], `${short(a.name)} / ${short(b.name)} / ${short(c.name)}`);
      if (f) flies.push(f);
    }
  }
  const byZ = (a: Screen, b: Screen) => Math.abs(b.z1y ?? 0) - Math.abs(a.z1y ?? 0);
  return { switches: switches.sort(byZ), flies: flies.sort(byZ) };
}

// ---------------------------------------------------------------- portfolio risk

export const DV01_BUCKETS = [
  { label: "0–3y", lo: 0, hi: 3 },
  { label: "3–7y", lo: 3, hi: 7 },
  { label: "7–15y", lo: 7, hi: 15 },
  { label: "15–30y", lo: 15, hi: 30 },
  { label: "30y+", lo: 30, hi: Infinity },
];

/** £ change in value for a 1bp fall in yield: nominal × price/100 × modified duration × 0.0001. */
export const dv01 = (nominal: number, price: number, modDur: number) => (nominal * price * modDur) / 1e6;

/** Yield moves (bp) by maturity for each scenario. Steepener/flattener pivot around 10 years. */
export const SCENARIOS: { label: string; shift: (years: number) => number }[] = [
  { label: "Yields −25bp", shift: () => -25 },
  { label: "Yields +25bp", shift: () => 25 },
  { label: "Yields +50bp", shift: () => 50 },
  { label: "Bull steepener (2y −25bp, 30y 0)", shift: (t) => -25 * Math.max(0, Math.min(1, (30 - t) / 28)) },
  { label: "Bear steepener (2y 0, 30y +25bp)", shift: (t) => 25 * Math.max(0, Math.min(1, (t - 2) / 28)) },
  { label: "Flattener (2y +25bp, 30y −25bp)", shift: (t) => 25 - 50 * Math.max(0, Math.min(1, (t - 2) / 28)) },
];

/** Forward settlement horizons for gilt forward yields. */
export const FWD_HORIZONS = [
  { id: "3m", label: "3 months", days: 91 },
  { id: "6m", label: "6 months", days: 182 },
  { id: "1y", label: "1 year", days: 365 },
] as const;
