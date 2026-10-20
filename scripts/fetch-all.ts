// Downloads every source, merges into data/, and records per-source status.
// One failing source never stops the others; its old data is kept.
//
//   npm run fetch-data                 # daily update
//   npm run fetch-data -- --backfill   # also pull ~3 years of history (slow, large downloads)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { addDays, latestDate, mergeCurveSets } from "../lib/curve";
import type { CurveSet, DataStatus } from "../lib/types";
import { fetchBoe } from "./sources/boe";
import { fetchBundesbank } from "./sources/bundesbank";
import { fetchDmo } from "./sources/dmo";
import { fetchUst } from "./sources/ust";

const DATA = path.resolve(process.env.DATA_DIR ?? "data");
const KEEP_YEARS = Number(process.env.KEEP_YEARS ?? 5);
const today = new Date().toISOString().slice(0, 10);
const keepFrom = addDays(today, -Math.round(KEEP_YEARS * 365.25));
const backfillSince = process.argv.includes("--backfill") ? addDays(today, -3 * 365) : undefined;

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
  await run("dmo", async () => {
    const { snapshot, warning } = await fetchDmo();
    await writeFile(path.join(DATA, "gilts.json"), JSON.stringify(snapshot, null, 1) + "\n");
    const priced = snapshot.gilts.filter((g) => g.yield != null).length;
    return { latestDate: snapshot.asOf, message: `${snapshot.gilts.length} gilts, ${priced} with yields${warning ? `; ${warning}` : ""}` };
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
