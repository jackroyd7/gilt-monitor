// Writes SYNTHETIC data to data-demo/ so the UI can be developed without network access.
// Never written to data/; the site shows a "Demo data" banner when status.demo is set.
//
//   npm run demo-data && DATA_DIR=data-demo npm run dev

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { giltModDuration, giltYieldFromClean } from "../lib/bond";
import { emptyHistory, historyJson, recordCloses } from "../lib/history";
import { addDays } from "../lib/curve";
import type { CurveId, CurveSet, DataStatus, Gilt, RateBasis } from "../lib/types";

const DIR = path.resolve("data-demo");
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

const ns = (t: number, b0: number, b1: number, b2: number, tau: number) => {
  const x = t / tau;
  const f = (1 - Math.exp(-x)) / x;
  return b0 + b1 * f + b2 * (f - Math.exp(-x));
};

const end = new Date().toISOString().slice(0, 10);
const dates: string[] = [];
for (let d = addDays(end, -730); d <= end; d = addDays(d, 1)) {
  const wd = new Date(d + "T00:00:00Z").getUTCDay();
  if (wd !== 0 && wd !== 6) dates.push(d);
}

function walk(start: number, vol: number) {
  let v = start;
  return dates.map(() => (v += vol * gauss()));
}

const levels = { uk: walk(4.6, 0.04), de: walk(2.6, 0.03), us: walk(4.3, 0.045) };
const slopes = { uk: walk(-0.6, 0.02), de: walk(-0.4, 0.015), us: walk(-0.2, 0.02) };
const swapSpread = walk(-0.35, 0.01);
const realGap = walk(3.4, 0.01);

function curve(id: CurveId, label: string, basis: RateBasis, tenors: number[], f: (i: number, t: number) => number): CurveSet {
  const rows: CurveSet["rows"] = {};
  dates.forEach((d, i) => (rows[d] = tenors.map((t) => +f(i, t).toFixed(4))));
  return { id, label, source: "DEMO (synthetic)", basis, tenors, rows };
}

const boeTenors = Array.from({ length: 80 }, (_, i) => (i + 1) / 2);
const uk = (i: number, t: number) => ns(t, levels.uk[i] + 0.4, slopes.uk[i], 1.2, 2.5);
const sets = [
  curve("uk_nominal", "UK gilt nominal zero", "zero_cc", boeTenors, uk),
  curve("uk_real", "UK gilt real zero", "zero_cc", boeTenors.filter((t) => t >= 2.5), (i, t) => uk(i, t) - realGap[i] + 0.002 * t),
  curve("uk_inflation", "UK implied RPI inflation", "zero_cc", boeTenors.filter((t) => t >= 2.5), (i) => realGap[i]),
  curve("uk_ois", "SONIA OIS zero", "zero_cc", boeTenors.filter((t) => t <= 30), (i, t) => uk(i, t) + swapSpread[i] - 0.012 * t),
  curve("de_bund", "German Bund zero", "zero_annual", Array.from({ length: 30 }, (_, i) => i + 1), (i, t) => ns(t, levels.de[i] + 0.5, slopes.de[i], 0.8, 3)),
  curve("us_ust", "US Treasury par", "par_semiannual", [1 / 12, 2 / 12, 3 / 12, 4 / 12, 0.5, 1, 2, 3, 5, 7, 10, 20, 30], (i, t) => ns(t, levels.us[i] + 0.3, slopes.us[i], 0.9, 2)),
];

const gilts: Gilt[] = [];
for (let y = 2027; y <= 2073; y += y < 2040 ? 1 : 3) {
  for (const month of y < 2035 ? ["01-31", "07-22"] : ["10-22"]) {
    const maturity = `${y}-${month}`;
    const t = (Date.parse(maturity) - Date.parse(end)) / (365.25 * 86400000);
    if (t < 0.3) continue;
    const coupon = Math.round((0.125 + rand() * 4.5) * 8) / 8;
    const target = ns(t, levels.uk[dates.length - 1] + 0.4, slopes.uk[dates.length - 1], 1.2, 2.5) + 0.04 * gauss();
    // Find the clean price that gives the target yield, by bisection.
    let lo = 1, hi = 300, calc = null;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      calc = giltYieldFromClean(mid, coupon, maturity, end);
      if (!calc) break;
      if (calc.yield > target) lo = mid; else hi = mid;
    }
    if (!calc) continue;
    const clean = +((lo + hi) / 2).toFixed(3);
    gilts.push({
      isin: `GB00DEMO${String(gilts.length).padStart(4, "0")}`,
      name: `${coupon}% Treasury Gilt ${y}`,
      type: "conventional",
      coupon,
      maturity,
      cleanPrice: clean,
      dirtyPrice: +calc.dirty.toFixed(3),
      yield: +calc.yield.toFixed(4),
    });
  }
}
const last = dates.length - 1;
// A gilt days from maturity with a meaningless yield, which the chart should hide.
gilts.unshift({ isin: "GB00DEMOSHRT", name: "0.375% Treasury Gilt 2026", type: "conventional", coupon: 0.375, maturity: addDays(end, 3), cleanPrice: 99.97, dirtyPrice: null, yield: 9.8 });
const realAt = (i: number, t: number) => uk(i, t) - realGap[i] + 0.002 * t;
for (const y of [2029, 2033, 2037, 2041, 2046, 2051, 2058, 2065, 2073]) {
  const t = y - Number(end.slice(0, 4));
  gilts.push({
    isin: `GB00DEMOIL${y - 2000}`,
    name: `0 1/8% Index-linked Treasury Gilt ${y}`,
    type: "index-linked",
    coupon: 0.125,
    maturity: `${y}-03-22`,
    cleanPrice: +(100 + 20 * Math.exp(-t / 20) + 5 * gauss()).toFixed(3),
    dirtyPrice: null,
    yield: +(realAt(last, t) + 0.05 * gauss()).toFixed(3),
    indexLag: 3,
  });
}
// An 8-month-lag linker, which the site must leave out.
gilts.push({ isin: "GB0031790826", name: "2% Index-linked Treasury Stock 2035", type: "index-linked", coupon: 2, maturity: "2035-01-26", cleanPrice: 250, dirtyPrice: null, yield: 1.1, indexLag: 8 });

// Daily closes for the last year: each gilt keeps a fixed offset to the curve plus noise.
const history = emptyHistory();
const offsets = gilts.map(() => 0.04 * gauss());
for (let i = Math.max(0, dates.length - 260); i <= last; i++) {
  recordCloses(
    history,
    dates[i],
    gilts.map((g, k) => {
      const t = (Date.parse(g.maturity) - Date.parse(dates[i])) / (365.25 * 86400000);
      const y = (g.type === "index-linked" ? realAt(i, t) : uk(i, t)) + offsets[k] + 0.01 * gauss();
      const yNow = g.yield ?? y;
      const dur = giltModDuration(g.coupon ?? 1, g.maturity, end, yNow) ?? t;
      const clean = g.cleanPrice == null ? null : g.cleanPrice * (1 - (dur * (y - yNow)) / 100);
      return { ...g, yield: +y.toFixed(4), cleanPrice: clean };
    }),
  );
}

// FX loosely tied to the 2y-ish rate gap, so the rates-vs-FX charts have something to show.
function demoFx() {
  const noise = { usd: walk(0, 0.004), eur: walk(0, 0.003), jpy: walk(0, 0.006), chf: walk(0, 0.004) };
  const rows: Record<string, number[]> = {};
  dates.forEach((d, i) => {
    const usd = 1.27 * Math.exp(0.03 * (levels.uk[i] - levels.us[i] - 0.3) + noise.usd[i]);
    const eur = 1.17 * Math.exp(0.02 * (levels.uk[i] - levels.de[i] - 2) + noise.eur[i]);
    const jpy = 190 * Math.exp(noise.jpy[i]);
    const chf = 1.12 * Math.exp(noise.chf[i]);
    const eri = 82 * Math.exp(0.6 * Math.log(usd / 1.27) + 0.4 * Math.log(eur / 1.17));
    rows[d] = [usd, eur, jpy, chf, eri].map((v) => +v.toFixed(4));
  });
  const cot: Record<string, Record<string, Record<string, number>>> = {};
  for (const [id, scale] of [["GBP", 40000], ["EUR", 90000], ["JPY", 70000], ["CHF", 15000]] as const) {
    const am = walk(0, scale / 10);
    const lev = walk(0, scale / 8);
    cot[id] = {};
    dates.forEach((d, i) => {
      if (new Date(d + "T00:00:00Z").getUTCDay() !== 2) return;
      cot[id][d] = { oi: scale * 5, amLong: scale + Math.max(am[i], -scale), amShort: scale, levLong: scale + Math.max(lev[i], -scale), levShort: scale };
    });
  }
  return { fx: { source: "DEMO", series: ["GBPUSD", "GBPEUR", "GBPJPY", "GBPCHF", "ERI"], rows }, cot: { source: "DEMO", rows: cot } };
}

async function main() {
  await mkdir(path.join(DIR, "curves"), { recursive: true });
  const { fx, cot } = demoFx();
  await writeFile(path.join(DIR, "fx.json"), JSON.stringify(fx));
  await writeFile(path.join(DIR, "cot.json"), JSON.stringify(cot));
  for (const s of sets) await writeFile(path.join(DIR, "curves", `${s.id}.json`), JSON.stringify(s));
  // Today's snapshot equals the last history row, as it would from the real job.
  const lastRow = history.rows[dates[last]];
  for (const g of gilts) if (lastRow[g.isin]) [g.cleanPrice, g.yield] = lastRow[g.isin];
  await writeFile(path.join(DIR, "gilts.json"), JSON.stringify({ asOf: end, priceDate: dates[last], source: "DEMO", gilts: gilts.filter((g) => g.indexLag !== 8) }));
  await writeFile(path.join(DIR, "gilt-history.json"), historyJson(history));
  const now = new Date().toISOString();
  const status: DataStatus = {
    updatedAt: now,
    demo: true,
    sources: Object.fromEntries(["boe", "bundesbank", "ust", "dmo", "boe_fx", "cftc"].map((k) => [k, { ok: true, checkedAt: now, latestDate: end, message: "demo" }])),
  };
  await writeFile(path.join(DIR, "status.json"), JSON.stringify(status, null, 2));
  console.log(`Wrote synthetic data for ${dates.length} days and ${gilts.length} gilts to ${DIR}`);
}

main();
