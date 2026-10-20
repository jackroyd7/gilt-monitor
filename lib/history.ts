// Daily close history per gilt (price and yield), recorded by the data job.
// Pure functions so they can be used by the job, the pages and the tests.

import { addDays } from "./curve";
import type { Gilt, GiltHistory } from "./types";

export const emptyHistory = (): GiltHistory => ({ gilts: {}, rows: {} });

/** Adds one day's closes. Existing values for that date are kept unless the new one is non-null. */
export function recordCloses(hist: GiltHistory, date: string, gilts: Gilt[]): number {
  const row = (hist.rows[date] ??= {});
  let n = 0;
  for (const g of gilts) {
    if (g.yield == null && g.cleanPrice == null) continue;
    hist.gilts[g.isin] = {
      name: g.name,
      maturity: g.maturity,
      type: g.type,
      ...(g.ticker ? { ticker: g.ticker } : hist.gilts[g.isin]?.ticker ? { ticker: hist.gilts[g.isin].ticker } : {}),
    };
    const prev = row[g.isin];
    row[g.isin] = [
      g.cleanPrice != null ? +g.cleanPrice.toFixed(4) : (prev?.[0] ?? null),
      g.yield != null ? +g.yield.toFixed(4) : (prev?.[1] ?? null),
    ];
    n++;
  }
  if (!Object.keys(row).length) delete hist.rows[date];
  return n;
}

export function pruneHistory(hist: GiltHistory, keepFrom: string) {
  for (const d of Object.keys(hist.rows)) if (d < keepFrom) delete hist.rows[d];
  const seen = new Set(Object.values(hist.rows).flatMap((r) => Object.keys(r)));
  for (const isin of Object.keys(hist.gilts)) if (!seen.has(isin)) delete hist.gilts[isin];
}

/** One date per line so a daily update is a one-line git diff. */
export function historyJson(hist: GiltHistory): string {
  const dates = Object.keys(hist.rows).sort();
  const lines = dates.map((d) => `    ${JSON.stringify(d)}: ${JSON.stringify(hist.rows[d])}`);
  return `{\n  "gilts": ${JSON.stringify(hist.gilts)},\n  "rows": {\n${lines.join(",\n")}\n  }\n}\n`;
}

/** [date, clean, yield] for one gilt, oldest first. */
export function giltSeries(hist: GiltHistory | undefined, isin: string): [string, number | null, number | null][] {
  if (!hist) return [];
  return Object.keys(hist.rows)
    .sort()
    .flatMap((d) => {
      const v = hist.rows[d][isin];
      return v ? [[d, v[0], v[1]] as [string, number | null, number | null]] : [];
    });
}

export interface YieldChanges {
  d1: number | null; // bp
  w1: number | null;
  m1: number | null;
}

/**
 * Yield changes in bp from the current yield (live, or the latest close) to the close
 * one business day, one week and one month earlier.
 */
export function yieldChanges(
  series: [string, number | null, number | null][],
  current: { date: string; yield: number | null },
): YieldChanges {
  const none = { d1: null, w1: null, m1: null };
  if (current.yield == null) return none;
  const withYield = series.filter((p) => p[2] != null && p[0] < current.date);
  const onOrBefore = (date: string) => {
    for (let i = withYield.length - 1; i >= 0; i--) if (withYield[i][0] <= date) return withYield[i][2] as number;
    return null;
  };
  const diff = (base: number | null) => (base == null ? null : (current.yield! - base) * 100);
  const last = withYield[withYield.length - 1];
  return {
    d1: diff(last ? (last[2] as number) : null),
    w1: diff(onOrBefore(addDays(current.date, -7))),
    m1: diff(onOrBefore(addDays(current.date, -30))),
  };
}

/** Weekdays going back from (and excluding) `from`. */
export function previousBusinessDays(from: string, n: number): string[] {
  const out: string[] = [];
  let d = from;
  while (out.length < n) {
    d = addDays(d, -1);
    const wd = new Date(d + "T00:00:00Z").getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
}

/** Date and hour in London for a given instant. */
export function londonNow(at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/**
 * Which trading day's close a price snapshot represents, or null if it is intraday.
 * A timestamp from an earlier day means that day's close. Today's prices count as the
 * close only after 17:00 London (gilts stop trading around 16:30).
 */
export function closeDate(priceTime: string | undefined, at = new Date()): string | null {
  const now = londonNow(at);
  let stamped: string | undefined;
  if (priceTime) {
    const t = new Date(priceTime);
    stamped = !isNaN(t.getTime()) ? londonNow(t).date : priceTime.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  }
  if (stamped && stamped < now.date) return stamped;
  const wd = new Date(now.date + "T00:00:00Z").getUTCDay();
  const weekday = wd !== 0 && wd !== 6;
  if (stamped === now.date) return now.hour >= 17 && weekday ? now.date : null;
  // No usable timestamp: assume prices are the latest close.
  return now.hour >= 17 && weekday ? now.date : previousBusinessDays(now.date, 1)[0];
}
