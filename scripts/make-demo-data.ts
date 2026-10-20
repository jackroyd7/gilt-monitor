// Writes SYNTHETIC data to data-demo/ so the UI can be developed without network access.
// Never written to data/; the site shows a "Demo data" banner when status.demo is set.
//
//   npm run demo-data && DATA_DIR=data-demo npm run dev

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { giltYieldFromClean } from "../lib/bond";
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
for (const y of [2029, 2033, 2037, 2041, 2046, 2051, 2058, 2065, 2073]) {
  gilts.push({
    isin: `GB00DEMOIL${y - 2000}`,
    name: `0 1/8% Index-linked Treasury Gilt ${y}`,
    type: "index-linked",
    coupon: 0.125,
    maturity: `${y}-03-22`,
    cleanPrice: null,
    dirtyPrice: null,
    yield: +(levels.uk[dates.length - 1] - realGap[dates.length - 1] + 0.4 + 0.02 * (y - 2026) + 0.05 * gauss()).toFixed(3),
  });
}

async function main() {
  await mkdir(path.join(DIR, "curves"), { recursive: true });
  for (const s of sets) await writeFile(path.join(DIR, "curves", `${s.id}.json`), JSON.stringify(s));
  await writeFile(path.join(DIR, "gilts.json"), JSON.stringify({ asOf: end, source: "DEMO", gilts }));
  const now = new Date().toISOString();
  const status: DataStatus = {
    updatedAt: now,
    demo: true,
    sources: Object.fromEntries(["boe", "bundesbank", "ust", "dmo"].map((k) => [k, { ok: true, checkedAt: now, latestDate: end, message: "demo" }])),
  };
  await writeFile(path.join(DIR, "status.json"), JSON.stringify(status, null, 2));
  console.log(`Wrote synthetic data for ${dates.length} days and ${gilts.length} gilts to ${DIR}`);
}

main();
