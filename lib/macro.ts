// Economic data: parsers for ONS, FRED CSV and IMF DataMapper responses, and the
// transforms (y/y, period-on-period) applied before saving. Dates are period starts
// ("2024-04-01" is April 2024, or Q2 2024 for a quarterly series).

import type { Transform } from "../config/macro";

export type Point = [string, number];
export type Freq = "M" | "Q" | "A" | "D";

export interface MacroSeries {
  title: string;
  source: string;
  freq: Freq;
  note?: string;
  points: Point[];
}

export interface MacroData {
  updatedAt: string;
  /** Keyed "<indicator>.<economy>", e.g. "cpi.UK". */
  series: Record<string, MacroSeries>;
  /** IMF WEO: imf[indicator][economy][year]. */
  imf: Record<string, Record<string, Record<string, number>>>;
  imfEdition?: string;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** ONS period label → period start: "2024 JAN" → 2024-01-01, "2024 Q2" → 2024-04-01, "2024" → 2024-01-01. */
export function onsDate(label: string): string | null {
  const s = label.trim().toUpperCase();
  let m = s.match(/^(\d{4}) ([A-Z]{3})$/);
  if (m) {
    const i = MONTHS.indexOf(m[2]);
    return i < 0 ? null : `${m[1]}-${String(i + 1).padStart(2, "0")}-01`;
  }
  m = s.match(/^(\d{4}) Q([1-4])$/);
  if (m) return `${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  m = s.match(/^(\d{4})$/);
  return m ? `${m[1]}-01-01` : null;
}

/** ONS time-series JSON (…/timeseries/<cdid>/<dataset>/data): the most frequent periodicity available. */
export function parseOns(json: unknown): { title: string; freq: Freq; points: Point[] } {
  const j = json as { description?: { title?: string }; months?: { date: string; value: string }[]; quarters?: { date: string; value: string }[]; years?: { date: string; value: string }[] };
  const pick = (rows: { date: string; value: string }[] | undefined) =>
    (rows ?? []).flatMap((r) => {
      const d = onsDate(r.date);
      const v = Number(r.value);
      return d && r.value !== "" && Number.isFinite(v) ? [[d, v] as Point] : [];
    });
  for (const [key, freq] of [["months", "M"], ["quarters", "Q"], ["years", "A"]] as const) {
    const points = pick(j[key]);
    if (points.length) return { title: j.description?.title ?? "", freq, points: points.sort((a, b) => a[0].localeCompare(b[0])) };
  }
  throw new Error("ONS response had no observations");
}

/** FRED fredgraph.csv: a date column then a value column; "." means missing. */
export function parseFredCsv(csv: string): Point[] {
  if (/<html/i.test(csv.slice(0, 300))) throw new Error("FRED returned a web page instead of CSV");
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2 || !/date/i.test(lines[0])) throw new Error("Unexpected FRED CSV header");
  return lines.slice(1).flatMap((l) => {
    const [d, v] = l.split(",");
    const n = Number(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && v !== "." && v !== "" && Number.isFinite(n) ? [[d, n] as Point] : [];
  });
}

/** ECB data portal CSV (format=csvdata): TIME_PERIOD and OBS_VALUE columns. */
export function parseEcbCsv(csv: string): Point[] {
  const lines = csv.trim().split(/\r?\n/).map((l) => l.split(","));
  const h = lines[0] ?? [];
  const ti = h.indexOf("TIME_PERIOD");
  const vi = h.indexOf("OBS_VALUE");
  if (ti < 0 || vi < 0) throw new Error("Unexpected ECB CSV header");
  return lines.slice(1).flatMap((l) => {
    const t = l[ti];
    const v = Number(l[vi]);
    const d = /^\d{4}-\d{2}$/.test(t) ? `${t}-01` : /^\d{4}-Q[1-4]$/.test(t) ? `${t.slice(0, 4)}-${String((Number(t[6]) - 1) * 3 + 1).padStart(2, "0")}-01` : null;
    return d && l[vi] !== "" && Number.isFinite(v) ? [[d, v] as Point] : [];
  });
}

/** Infers frequency from the typical gap between observations. */
export function inferFreq(points: Point[]): Freq {
  if (points.length < 3) return "M";
  const gaps = points.slice(1).map((p, i) => (Date.parse(p[0]) - Date.parse(points[i][0])) / 86_400_000).sort((a, b) => a - b);
  const g = gaps[Math.floor(gaps.length / 2)];
  return g < 20 ? "D" : g < 45 ? "M" : g < 140 ? "Q" : "A";
}

/** Daily series (e.g. policy rates) → the last value in each month. */
export function monthlyLast(points: Point[]): Point[] {
  const byMonth = new Map<string, number>();
  for (const [d, v] of points) byMonth.set(`${d.slice(0, 7)}-01`, v);
  return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Applies a transform, matching periods by date (not position) so gaps don't misalign. */
export function transform(points: Point[], t: Transform, freq: Freq): Point[] {
  if (t === "level") return points;
  const byDate = new Map(points);
  const back = (d: string, n: number) => {
    const dt = new Date(d + "T00:00:00Z");
    const months = t === "yoy" ? 12 : freq === "M" ? 1 : freq === "Q" ? 3 : 12;
    dt.setUTCMonth(dt.getUTCMonth() - months * n);
    return dt.toISOString().slice(0, 10);
  };
  return points.flatMap(([d, v]) => {
    const prev = byDate.get(back(d, 1));
    if (prev == null) return [];
    if (t === "diff") return [[d, v - prev] as Point];
    return prev ? [[d, (v / prev - 1) * 100] as Point] : [];
  });
}

/** IMF DataMapper API response → values[indicator][country][year]. */
export function parseImf(json: unknown): Record<string, Record<string, Record<string, number>>> {
  const values = (json as { values?: Record<string, Record<string, Record<string, unknown>>> }).values ?? {};
  const out: Record<string, Record<string, Record<string, number>>> = {};
  for (const [ind, byCountry] of Object.entries(values)) {
    for (const [c, byYear] of Object.entries(byCountry ?? {})) {
      for (const [y, v] of Object.entries(byYear ?? {})) {
        if (typeof v === "number" && Number.isFinite(v)) ((out[ind] ??= {})[c] ??= {})[y] = v;
      }
    }
  }
  return out;
}

/** Human label for a period: "Sep 2026", "Q3 2026", "2026". */
export function periodLabel(date: string, freq: Freq): string {
  const y = date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  if (freq === "Q") return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  if (freq === "A") return y;
  return `${MONTHS[m - 1][0]}${MONTHS[m - 1].slice(1).toLowerCase()} ${y}`;
}
