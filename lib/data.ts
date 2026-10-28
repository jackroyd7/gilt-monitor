import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CotHistory, FxHistory } from "./fx";
import type { MacroData } from "./macro";
import { withLatestCloses } from "./history";
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

/** BoE daily FX rates and CFTC positioning, written by the data job. */
export async function loadFx(): Promise<{ fx: FxHistory | undefined; cot: CotHistory | undefined }> {
  const [fx, cot] = await Promise.all([readJson<FxHistory>(path.join(dataDir(), "fx.json")), readJson<CotHistory>(path.join(dataDir(), "cot.json"))]);
  return { fx, cot };
}

/** Economic indicators written by the data job. */
export async function loadMacro(): Promise<MacroData | undefined> {
  return readJson<MacroData>(path.join(dataDir(), "macro.json"));
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

/**
 * Market data with gilt prices layered: intraday giltsyield.com prices where available,
 * else the DMO close, else the latest close recorded in the gilt history.
 */
export async function loadMarketWithLive(): Promise<
  Market & { live: LiveSnapshot | null; dmoGilts: GiltSnapshot | undefined; history: GiltHistory | undefined }
> {
  const [market, live, history] = await Promise.all([loadMarket(), getLive(), loadGiltHistory()]);
  const closes = withLatestCloses(market.gilts, history);
  return { ...market, gilts: withLive(closes, live), dmoGilts: closes, live, history };
}
