// The menu of daily spreads, slopes and other rate series for the Rates tab, computed from
// our curves (BoE, Bundesbank, US Treasury) and FRED series. Pure: callers pass the data.

import { rateSA } from "./analytics";
import { sortedDates } from "./curve";
import type { RatesData } from "./rates";
import type { CurveId, CurveSet } from "./types";

type Point = [string, number];
type Curves = Partial<Record<CurveId, CurveSet>>;

export interface SpreadDef {
  id: string;
  label: string;
  group: string;
  unit: "bp" | "pct";
  note?: string;
}

// leg: [curve, tenor]; a series is Σ weight × rate (bp unless it's a single level in %).
type Leg = [CurveId, number, number];
const DEFS: (SpreadDef & { legs?: Leg[]; fred?: keyof RatesData["series"] })[] = [];
const add = (d: SpreadDef & { legs?: Leg[]; fred?: keyof RatesData["series"] }) => DEFS.push(d);

const MARKETS: [CurveId, string][] = [
  ["uk_nominal", "UK"],
  ["us_ust", "US"],
  ["de_bund", "Germany"],
];
for (const [c, name] of MARKETS) {
  for (const [a, b] of [[2, 5], [2, 10], [5, 30], [10, 30], [2, 30]] as const)
    add({ id: `slope:${c}:${a}:${b}`, label: `${name} ${a}s${b}s`, group: "Curve slopes", unit: "bp", legs: [[c, b, 1], [c, a, -1]] });
  for (const [a, b, cc] of [[2, 5, 10], [5, 10, 30]] as const)
    add({ id: `fly:${c}:${a}:${b}:${cc}`, label: `${name} ${a}s${b}s${cc}s fly`, group: "Butterflies (2 × belly − wings)", unit: "bp", legs: [[c, b, 2], [c, a, -1], [c, cc, -1]] });
}
for (const t of [2, 5, 10, 30]) {
  add({ id: `xm:uk-de:${t}`, label: `UK − Germany ${t}y`, group: "Cross-market spreads", unit: "bp", legs: [["uk_nominal", t, 1], ["de_bund", t, -1]] });
  add({ id: `xm:uk-us:${t}`, label: `UK − US ${t}y`, group: "Cross-market spreads", unit: "bp", legs: [["uk_nominal", t, 1], ["us_ust", t, -1]] });
  add({ id: `xm:us-de:${t}`, label: `US − Germany ${t}y`, group: "Cross-market spreads", unit: "bp", legs: [["us_ust", t, 1], ["de_bund", t, -1]] });
}
for (const t of [2, 5, 10, 20, 30])
  add({ id: `ois:${t}`, label: `Gilt − SONIA OIS ${t}y`, group: "Swap spreads (UK)", unit: "bp", note: "BoE gilt zero minus OIS zero", legs: [["uk_nominal", t, 1], ["uk_ois", t, -1]] });
for (const t of [5, 10, 20, 30]) add({ id: `bei:uk:${t}`, label: `UK ${t}y RPI breakeven`, group: "Inflation and real yields", unit: "pct", legs: [["uk_inflation", t, 1]] });
for (const t of [5, 10, 30]) add({ id: `real:uk:${t}`, label: `UK ${t}y real yield`, group: "Inflation and real yields", unit: "pct", legs: [["uk_real", t, 1]] });
add({ id: "fred:US_BEI5", label: "US 5y breakeven", group: "Inflation and real yields", unit: "pct", fred: "US_BEI5" });
add({ id: "fred:US_BEI10", label: "US 10y breakeven", group: "Inflation and real yields", unit: "pct", fred: "US_BEI10" });
add({ id: "fred:US_5Y5Y", label: "US 5y5y inflation", group: "Inflation and real yields", unit: "pct", fred: "US_5Y5Y" });
add({ id: "fred:US_REAL10", label: "US 10y real yield", group: "Inflation and real yields", unit: "pct", fred: "US_REAL10" });
for (const [c, name] of MARKETS) for (const t of [2, 10, 30]) add({ id: `lvl:${c}:${t}`, label: `${name} ${t}y yield`, group: "Yield levels", unit: "pct", legs: [[c, t, 1]] });

export const SPREAD_MENU: SpreadDef[] = DEFS.map(({ id, label, group, unit, note }) => ({ id, label, group, unit, note }));

export const DEFAULT_SPREADS = ["xm:uk-de:10", "xm:us-de:10", "slope:uk_nominal:2:10", "slope:us_ust:2:10", "slope:us_ust:5:30", "slope:de_bund:2:10"];

/** Computes one series since `since`. Legs on other curves use their latest date on or before. */
export function spreadSeries(id: string, curves: Curves, rates: RatesData | undefined, since: string): Point[] {
  const def = DEFS.find((d) => d.id === id);
  if (!def) return [];
  if (def.fred) return ((rates?.series[def.fred] ?? []) as Point[]).filter(([d]) => d >= since);
  const legs = def.legs!;
  const base = curves[legs[0][0]];
  if (!base) return [];
  const others = legs.map(([c]) => (c === legs[0][0] ? null : curves[c] ? sortedDates(curves[c]!) : null));
  const idx = legs.map(() => 0);
  const out: Point[] = [];
  for (const d of sortedDates(base)) {
    if (d < since) continue;
    let v = 0;
    let ok = true;
    for (let i = 0; i < legs.length; i++) {
      const [c, t, w] = legs[i];
      let date = d;
      const ds = others[i];
      if (ds) {
        while (idx[i] + 1 < ds.length && ds[idx[i] + 1] <= d) idx[i]++;
        if (!ds[idx[i]] || ds[idx[i]] > d) {
          ok = false;
          break;
        }
        date = ds[idx[i]];
      }
      const r = rateSA(curves[c], date, t);
      if (r == null) {
        ok = false;
        break;
      }
      v += w * r;
    }
    if (ok) out.push([d, +(def.unit === "bp" ? v * 100 : v).toFixed(def.unit === "bp" ? 1 : 3)]);
  }
  return out;
}
