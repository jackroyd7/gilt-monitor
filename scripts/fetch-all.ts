// Downloads every source, merges into data/, and records per-source status.
// One failing source never stops the others; its old data is kept.
//
//   npm run fetch-data                 # daily update
//   npm run fetch-data -- --backfill   # also pull ~3 years of curve history (slow, large downloads)
//   npm run fetch-data -- --gilt-days=60   # backfill per-gilt closes from giltsyield.com (needs the API key)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { addDays, latestDate, mergeCurveSets } from "../lib/curve";
import { closeDate, emptyHistory, historyJson, previousBusinessDays, pruneHistory, recordCloses, repeatsPreviousClose } from "../lib/history";
import { fetchAllPrices } from "../lib/live-core";
import type { CurveSet, DataStatus, GiltHistory, GiltSnapshot } from "../lib/types";
import type { CotHistory, FxHistory } from "../lib/fx";
import type { MacroData } from "../lib/macro";
import type { CommodityData } from "../lib/commodities";
import type { PolicyData } from "../lib/policy";
import type { RatesData } from "../lib/rates";
import type { StockQuotes } from "../lib/stocks";
import { fetchBoe } from "./sources/boe";
import { fetchBundesbank } from "./sources/bundesbank";
import { fetchDmo } from "./sources/dmo";
import { fetchBoeFx, fetchCot } from "./sources/fx";
import { fetchMacro } from "./sources/macro";
import { fetchCommodities } from "./sources/commodities";
import { fetchPolicy } from "./sources/policy";
import { fetchRates } from "./sources/rates";
import { fetchStockQuotes } from "./sources/stocks";
import { fetchStockMetrics } from "./sources/stock-metrics";
import type { StockMetricsFile } from "../lib/stock-metrics";
import { fetchUst } from "./sources/ust";

const DATA = path.resolve(process.env.DATA_DIR ?? "data");
const KEEP_YEARS = Number(process.env.KEEP_YEARS ?? 5);
const today = new Date().toISOString().slice(0, 10);
const keepFrom = addDays(today, -Math.round(KEEP_YEARS * 365.25));
const backfillSince = process.argv.includes("--backfill") ? addDays(today, -3 * 365) : undefined;
const giltDaysArg = process.argv.find((a) => a.startsWith("--gilt-days="));
const backfillGiltDays = giltDaysArg ? Number(giltDaysArg.split("=")[1]) : backfillSince ? 25 : 0;

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

// One row per line keeps git diffs small: a daily update touches a handful of lines.
function curveJson(set: CurveSet): string {
  const dates = Object.keys(set.rows).sort();
  const rows = dates.map((d) => `    ${JSON.stringify(d)}: ${JSON.stringify(set.rows[d].map((v) => (v == null ? null : +v.toFixed(4))))}`);
  const { rows: _omit, ...meta } = set;
  void _omit;
  const head = JSON.stringify(meta, null, 2).slice(0, -2);
  return `${head},\n  "rows": {\n${rows.join(",\n")}\n  }\n}\n`;
}

/** Like curveJson: one dated row per line. */
function rowsJson<T extends { rows: Record<string, unknown> }>(obj: T): string {
  const { rows, ...meta } = obj;
  const lines = Object.keys(rows).sort().map((d) => `    ${JSON.stringify(d)}: ${JSON.stringify(rows[d])}`);
  return `${JSON.stringify(meta, null, 2).slice(0, -2)},\n  "rows": {\n${lines.join(",\n")}\n  }\n}\n`;
}

async function saveCurve(fresh: CurveSet) {
  const file = path.join(DATA, "curves", `${fresh.id}.json`);
  const merged = mergeCurveSets(await readJson<CurveSet>(file), fresh, keepFrom);
  await writeFile(file, curveJson(merged));
  return merged;
}

async function main() {
  await mkdir(path.join(DATA, "curves"), { recursive: true });
  const statusFile = path.join(DATA, "status.json");
  const status: DataStatus = (await readJson<DataStatus>(statusFile)) ?? { updatedAt: today, sources: {} };
  delete status.demo;
  const checkedAt = new Date().toISOString();

  const run = async (id: string, job: () => Promise<{ latestDate?: string; message?: string }>) => {
    console.log(`→ ${id}`);
    try {
      const r = await job();
      status.sources[id] = { ok: true, checkedAt, ...r };
      console.log(`  ok, latest ${r.latestDate ?? "?"}${r.message ? ` (${r.message})` : ""}`);
    } catch (e) {
      const message = (e as Error).message;
      status.sources[id] = { ...status.sources[id], ok: false, checkedAt, message };
      console.error(`  FAILED: ${message}`);
    }
  };

  await run("boe", async () => {
    const sets = await fetchBoe({ backfillSince });
    const saved = await Promise.all(sets.map(saveCurve));
    return {
      latestDate: saved.map((s) => latestDate(s)).sort().pop(),
      message: saved.map((s) => s.id).join(", "),
    };
  });
  await run("bundesbank", async () => ({ latestDate: latestDate(await saveCurve(await fetchBundesbank({ backfillSince }))) }));
  await run("ust", async () => ({ latestDate: latestDate(await saveCurve(await fetchUst({ backfillSince }))) }));
  // FX and positioning are small, so the whole kept history is re-downloaded each run.
  await run("boe_fx", async () => {
    const fx: FxHistory = await fetchBoeFx(keepFrom);
    const old = await readJson<FxHistory>(path.join(DATA, "fx.json"));
    if (old && old.series.join() === fx.series.join()) fx.rows = { ...Object.fromEntries(Object.entries(old.rows).filter(([d]) => d >= keepFrom)), ...fx.rows };
    await writeFile(path.join(DATA, "fx.json"), rowsJson(fx));
    return { latestDate: Object.keys(fx.rows).sort().pop() };
  });
  await run("cftc", async () => {
    const cot: CotHistory = await fetchCot(addDays(today, -3 * 365));
    await writeFile(path.join(DATA, "cot.json"), JSON.stringify(cot) + "\n");
    const latest = Object.values(cot.rows).flatMap((r) => Object.keys(r ?? {})).sort().pop();
    return { latestDate: latest, message: Object.keys(cot.rows).join(", ") };
  });

  await run("macro", async () => {
    const file = path.join(DATA, "macro.json");
    const { data, failures } = await fetchMacro(await readJson<MacroData>(file));
    if (!Object.keys(data.series).length) throw new Error(failures.slice(0, 3).join("; ") || "no series");
    await writeFile(file, JSON.stringify(data) + "\n");
    const latest = Object.values(data.series).map((s) => s.points[s.points.length - 1]?.[0] ?? "").sort().pop();
    return { latestDate: latest, message: `${Object.keys(data.series).length} series${failures.length ? `; ${failures.length} failed: ${failures.join(" | ")}` : ""}` };
  });

  await run("commodities", async () => {
    const file = path.join(DATA, "commodities.json");
    const { data, failures } = await fetchCommodities(await readJson<CommodityData>(file), keepFrom, addDays(today, -3 * 365));
    if (!Object.keys(data.prices).length && !Object.keys(data.cot).length) throw new Error(failures.join("; ") || "no data");
    await writeFile(file, JSON.stringify(data) + "\n");
    const latest = Object.values(data.prices).map((p) => p?.[p.length - 1]?.[0] ?? "").sort().pop();
    return { latestDate: latest, message: failures.length ? `failed: ${failures.join(" | ")}` : `${Object.keys(data.prices).length} prices, ${Object.keys(data.cot).length} positioning` };
  });

  await run("boe_policy", async () => {
    const file = path.join(DATA, "boe-policy.json");
    const { data, notes } = await fetchPolicy(await readJson<PolicyData>(file), addDays(today, -3 * 365));
    await writeFile(file, JSON.stringify(data) + "\n");
    const upcoming = data.mpcDates.filter((d) => d >= today);
    return { latestDate: data.bankRate.at(-1)?.[0], message: [`${upcoming.length} upcoming MPC dates (next ${upcoming[0] ?? "unknown"})`, ...notes].join("; ") };
  });

  await run("rates", async () => {
    const file = path.join(DATA, "rates.json");
    const { data, failures } = await fetchRates(await readJson<RatesData>(file), addDays(today, -3 * 365));
    if (!Object.keys(data.series).length) throw new Error(failures.join("; ") || "no data");
    await writeFile(file, JSON.stringify(data) + "\n");
    const latest = Object.values(data.series).map((p) => p?.at(-1)?.[0] ?? "").sort().pop();
    return { latestDate: latest, message: failures.length ? `failed: ${failures.join(" | ")}` : `${Object.keys(data.series).length} series` };
  });

  await run("stocks", async () => {
    const file = path.join(DATA, "stocks.json");
    const { data, ok, total } = await fetchStockQuotes(await readJson<StockQuotes>(file));
    if (!ok) throw new Error(`no quotes for any of ${total} stocks`);
    await writeFile(file, JSON.stringify(data) + "\n");
    const latest = Object.values(data.quotes).map((q) => q.time.slice(0, 10)).sort().pop();
    return { latestDate: latest, message: `${ok}/${total} UK, European and Asian stocks, sector ETFs and commodity futures` };
  });

  await run("stock_metrics", async () => {
    const file = path.join(DATA, "stock-metrics.json");
    const { data, ok, total, skipped } = await fetchStockMetrics(await readJson<StockMetricsFile>(file), process.argv.includes("--metrics"));
    if (skipped) return { latestDate: data.updatedAt.slice(0, 10), message: `${ok} stocks (refreshed daily)` };
    if (!ok) throw new Error(`no metrics for any of ${total} stocks`);
    // One stock per line keeps the daily diff readable.
    const lines = Object.keys(data.stocks).sort().map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(data.stocks[k])}`);
    await writeFile(file, `{\n  "updatedAt": ${JSON.stringify(data.updatedAt)},\n  "stocks": {\n${lines.join(",\n")}\n  }\n}\n`);
    return { latestDate: data.updatedAt.slice(0, 10), message: `${ok}/${total} stocks` };
  });

  let dmoSnapshot: GiltSnapshot | undefined;
  await run("dmo", async () => {
    const { snapshot, warning } = await fetchDmo();
    dmoSnapshot = snapshot;
    await writeFile(path.join(DATA, "gilts.json"), JSON.stringify(snapshot, null, 1) + "\n");
    const priced = snapshot.gilts.filter((g) => g.yield != null).length;
    return { latestDate: snapshot.asOf, message: `${snapshot.gilts.length} gilts, ${priced} with yields${warning ? `; ${warning}` : ""}` };
  });

  await run("gilt_history", async () => {
    const file = path.join(DATA, "gilt-history.json");
    const hist = (await readJson<GiltHistory>(file)) ?? emptyHistory();
    const notes: string[] = [];
    if (process.env.GILTSYIELD_API_KEY) {
      // Backfill oldest first; skip days we already have in full.
      const days = previousBusinessDays(today, backfillGiltDays).reverse();
      let filled = 0;
      for (const d of days) {
        if (Object.keys(hist.rows[d] ?? {}).length > 20) continue;
        try {
          const snap = await fetchAllPrices({ date: d });
          filled += recordCloses(hist, d, snap.gilts) ? 1 : 0;
        } catch (e) {
          console.warn(`  no giltsyield closes for ${d}: ${(e as Error).message}`);
        }
      }
      if (days.length) notes.push(`backfilled ${filled}/${days.length} days`);
      const snap = await fetchAllPrices();
      const d = closeDate(snap.priceTime);
      const stale = d ? repeatsPreviousClose(hist, d, snap.gilts) : null;
      notes.push(`giltsyield price time ${snap.priceTime ?? "not given"}`);
      if (!d) notes.push("prices are intraday; close not recorded yet");
      else if (stale) notes.push(`prices unchanged from the ${stale} close; not recorded as ${d}`);
      else notes.push(`giltsyield ${d}: ${recordCloses(hist, d, snap.gilts)} gilts`);
    }
    if (dmoSnapshot) {
      // DMO closes fill any gilt giltsyield didn't price (or everything, without a key).
      const d = dmoSnapshot.priceDate ?? closeDate(undefined)!;
      const have = hist.rows[d] ?? {};
      const missing = repeatsPreviousClose(hist, d, dmoSnapshot.gilts) ? [] : dmoSnapshot.gilts.filter((g) => !have[g.isin]);
      if (missing.length) notes.push(`DMO ${d}: ${recordCloses(hist, d, missing)} gilts`);
    }
    pruneHistory(hist, keepFrom);
    await writeFile(file, historyJson(hist));
    const dates = Object.keys(hist.rows).sort();
    return { latestDate: dates[dates.length - 1], message: notes.join("; ") };
  });

  status.updatedAt = checkedAt;
  await writeFile(statusFile, JSON.stringify(status, null, 2) + "\n");
  const failed = Object.entries(status.sources).filter(([, s]) => !s.ok).map(([k]) => k);
  if (failed.length === Object.keys(status.sources).length) {
    console.error("All sources failed.");
    process.exit(1);
  }
}

main();
