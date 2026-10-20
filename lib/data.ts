import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CurveId, CurveSet, DataStatus, GiltSnapshot } from "./types";

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

/** Reads everything the daily job wrote. DATA_DIR lets you point at demo data locally. */
export async function loadMarket(): Promise<Market> {
  // Data files are shipped via outputFileTracingIncludes in next.config.ts.
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR ?? "data");
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
