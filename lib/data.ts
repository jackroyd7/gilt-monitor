import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getLive, withLive, type LiveSnapshot } from "./live";
import type { CurveId, CurveSet, DataStatus, GiltHistory, GiltSnapshot } from "./types";

const CURVE_IDS: CurveId[] = ["uk_nominal", "uk_real", "uk_inflation", "uk_ois", "de_bund", "us_ust"];

export type Curves = Partial<Record<CurveId, CurveSet>>;

export interface Market {
  curves: Curves;
  gilts: GiltSnapshot | undefined;
  status: DataStatus | undefined;
}

async function readJson<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

const dataDir = () => path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR ?? "data");

/** Daily closes per gilt, recorded by the data job. */
export async function loadGiltHistory(): Promise<GiltHistory | undefined> {
  return readJson<GiltHistory>(path.join(dataDir(), "gilt-history.json"));
}

/** Reads everything the daily job wrote. DATA_DIR lets you point at demo data locally. */
export async function loadMarket(): Promise<Market> {
  // Data files are shipped via outputFileTracingIncludes in next.config.ts.
  const dir = dataDir();
  const curves: Curves = {};
  await Promise.all(
    CURVE_IDS.map(async (id) => {
      const set = await readJson<CurveSet>(path.join(dir, "curves", `${id}.json`));
      if (set && Object.keys(set.rows).length) curves[id] = set;
    }),
  );
  return {
    curves,
    gilts: await readJson<GiltSnapshot>(path.join(dir, "gilts.json")),
    status: await readJson<DataStatus>(path.join(dir, "status.json")),
  };
}

/** Market data with intraday giltsyield.com prices overlaid on the DMO close, when configured. */
export async function loadMarketWithLive(): Promise<Market & { live: LiveSnapshot | null; dmoGilts: GiltSnapshot | undefined }> {
  const [market, live] = await Promise.all([loadMarket(), getLive()]);
  return { ...market, gilts: withLive(market.gilts, live), dmoGilts: market.gilts, live };
}
