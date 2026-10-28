import type { CurveSet, RateBasis } from "./types";

/** Linear interpolation on (tenor, rate) pairs, skipping nulls. No extrapolation. */
export function interpolate(
  tenors: number[],
  rates: (number | null)[],
  t: number,
): number | null {
  let lo = -1;
  let hi = -1;
  for (let i = 0; i < tenors.length; i++) {
    if (rates[i] == null) continue;
    if (tenors[i] === t) return rates[i];
    if (tenors[i] < t) lo = i;
    else if (hi === -1) hi = i;
  }
  if (lo === -1 || hi === -1) return null;
  const w = (t - tenors[lo]) / (tenors[hi] - tenors[lo]);
  return (rates[lo] as number) * (1 - w) + (rates[hi] as number) * w;
}

export function sortedDates(set: CurveSet): string[] {
  return Object.keys(set.rows).sort();
}

export function latestDate(set: CurveSet | undefined): string | undefined {
  if (!set) return undefined;
  const d = sortedDates(set);
  return d[d.length - 1];
}

/** The last available date on or before `date`. */
export function dateOnOrBefore(set: CurveSet, date: string): string | undefined {
  let best: string | undefined;
  for (const d of Object.keys(set.rows)) {
    if (d <= date && (!best || d > best)) best = d;
  }
  return best;
}

export function rateAt(set: CurveSet | undefined, date: string, tenor: number): number | null {
  if (!set) return null;
  const row = set.rows[date];
  return row ? interpolate(set.tenors, row, tenor) : null;
}

/** Time series of one tenor: [[date, rate], ...] in date order. */
export function tenorSeries(set: CurveSet | undefined, tenor: number, fromDate?: string) {
  if (!set) return [];
  const out: [string, number][] = [];
  for (const d of sortedDates(set)) {
    if (fromDate && d < fromDate) continue;
    const v = interpolate(set.tenors, set.rows[d], tenor);
    if (v != null) out.push([d, v]);
  }
  return out;
}

/**
 * Merge a freshly downloaded curve set into the stored one. New rows win; tenors become
 * the union of both grids (rows from the other grid are re-sampled by interpolation).
 */
export function mergeCurveSets(old: CurveSet | undefined, fresh: CurveSet, keepFrom?: string): CurveSet {
  if (!old) return prune(fresh, keepFrom);
  const tenors = [...new Set([...old.tenors, ...fresh.tenors])].sort((a, b) => a - b);
  const resample = (src: CurveSet, row: (number | null)[]) =>
    tenors.map((t) => {
      const i = src.tenors.indexOf(t);
      if (i !== -1) return row[i];
      // Only fill gaps inside the source's own range, never extend it.
      return interpolate(src.tenors, row, t);
    });
  const rows: CurveSet["rows"] = {};
  for (const [d, r] of Object.entries(old.rows)) rows[d] = resample(old, r);
  for (const [d, r] of Object.entries(fresh.rows)) rows[d] = resample(fresh, r);
  return prune({ ...fresh, tenors, rows }, keepFrom);
}

function prune(set: CurveSet, keepFrom?: string): CurveSet {
  if (!keepFrom) return set;
  const rows: CurveSet["rows"] = {};
  for (const [d, r] of Object.entries(set.rows)) if (d >= keepFrom) rows[d] = r;
  return { ...set, rows };
}

/** Convert a rate (percent) from one compounding basis to semi-annual. */
export function toSemiannual(rate: number, basis: RateBasis): number {
  const r = rate / 100;
  switch (basis) {
    case "zero_cc":
      return 200 * (Math.exp(r / 2) - 1);
    case "zero_annual":
      return 200 * (Math.sqrt(1 + r) - 1);
    case "par_semiannual":
    case "fwd_inst": // a forward overnight rate; compounding conversion doesn't apply
      return rate;
  }
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Year fraction between two ISO dates, act/365.25. */
export function yearsBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / (365.25 * 86400000);
}
