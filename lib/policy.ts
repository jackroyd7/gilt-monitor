// Bank Rate expectations from the SONIA OIS curve. The BoE's short-end instantaneous
// forward at horizon t is (roughly) the overnight rate the market expects then; averaging
// it over the weeks after each MPC decision gives the SONIA expected for that meeting, and
// adding today's Bank Rate − SONIA gap turns it into an implied Bank Rate.

import { interpolate } from "./curve";
import type { CurveSet } from "./types";

export interface PolicyData {
  updatedAt: string;
  /** Upcoming (and recent) MPC announcement dates, YYYY-MM-DD. */
  mpcDates: string[];
  bankRate: [string, number][];
  sonia: [string, number][];
}

const DAY = 86_400_000;
const years = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / (365.25 * DAY);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);

/** Average forward over [t0, t1] years, sampled weekly. */
function avgForward(set: CurveSet, row: (number | null)[], t0: number, t1: number): number | null {
  const xs: number[] = [];
  for (let t = Math.max(t0, set.tenors[0]); t <= t1 + 1e-9; t += 7 / 365.25) {
    const v = interpolate(set.tenors, row, Math.min(t, set.tenors[set.tenors.length - 1]));
    if (v != null) xs.push(v);
  }
  if (!xs.length) {
    const v = interpolate(set.tenors, row, Math.max(t0, set.tenors[0]));
    return v;
  }
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export interface MeetingPath {
  date: string;
  /** Implied Bank Rate after this meeting, %. */
  rate: number;
  /** Change from today's Bank Rate, bp. */
  cumulative: number;
  /** Change at this meeting alone, bp. */
  change: number;
}

/**
 * Implied Bank Rate after each MPC meeting after `curveDate`, while the forward curve reaches.
 * Decisions take effect the next business day; we use the period until the next meeting.
 */
export function meetingPath(set: CurveSet, curveDate: string, mpcDates: string[], bankRate: number, sonia: number | null): MeetingPath[] {
  const row = set.rows[curveDate];
  if (!row) return [];
  const gap = sonia == null ? 0 : bankRate - sonia;
  const maxT = set.tenors[set.tenors.length - 1];
  const upcoming = mpcDates.filter((d) => d > curveDate);
  const out: MeetingPath[] = [];
  let prev = bankRate;
  upcoming.forEach((d, i) => {
    const start = years(curveDate, addDays(d, 1));
    const next = upcoming[i + 1];
    const end = next ? years(curveDate, next) : start + 45 / 365.25;
    if (end > maxT) return;
    const f = avgForward(set, row, start, end);
    if (f == null) return;
    const rate = f + gap;
    out.push({ date: d, rate, cumulative: (rate - bankRate) * 100, change: (rate - prev) * 100 });
    prev = rate;
  });
  return out;
}

/** Implied Bank Rate by month ahead (forward + Bank Rate − SONIA gap), for charting. */
export function monthlyPath(set: CurveSet, curveDate: string, gap: number, months = 36): [number, number][] {
  const row = set.rows[curveDate];
  if (!row) return [];
  const out: [number, number][] = [];
  for (let m = 1; m <= months; m++) {
    const v = interpolate(set.tenors, row, m / 12);
    if (v != null) out.push([m / 12, +(v + gap).toFixed(4)]);
  }
  return out;
}

/** Latest value on or before a date. */
export function lastOnOrBefore(points: [string, number][], date: string): number | null {
  let v: number | null = null;
  for (const [d, x] of points) {
    if (d > date) break;
    v = x;
  }
  return v;
}
