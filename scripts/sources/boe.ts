import { unzipSync } from "fflate";
import { boeKindFromFilename, parseBoeWorkbook, type BoeCurveKind } from "../../lib/parsers";
import type { CurveSet } from "../../lib/types";
import { getBytes } from "./http";

const BASE = "https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves";
const LATEST = process.env.BOE_LATEST_URL ?? `${BASE}/latest-yield-curve-data.zip`;
// Full daily archives, used with --backfill. Each is a zip of workbooks split by date range.
const ARCHIVES = [
  `${BASE}/glcnominalddata.zip`,
  `${BASE}/glcrealddata.zip`,
  `${BASE}/glcinflationddata.zip`,
  `${BASE}/oisddata.zip`,
];

const META: Record<BoeCurveKind, Pick<CurveSet, "id" | "label">> = {
  nominal: { id: "uk_nominal", label: "UK gilt nominal zero" },
  real: { id: "uk_real", label: "UK gilt real zero" },
  inflation: { id: "uk_inflation", label: "UK implied RPI inflation" },
  ois: { id: "uk_ois", label: "SONIA OIS zero" },
};

// The OIS workbook's monthly short-end forwards, for the Bank Rate path.
const OIS_FWD: Pick<CurveSet, "id" | "label"> = { id: "uk_ois_fwd", label: "SONIA OIS instantaneous forwards (short end)" };

function collect(zipBytes: Uint8Array, into: Map<BoeCurveKind | "ois_fwd", CurveSet>, sinceDate?: string) {
  const files = unzipSync(zipBytes);
  for (const [name, bytes] of Object.entries(files)) {
    const kind = boeKindFromFilename(name.split("/").pop() ?? name);
    if (!kind) continue;
    if (kind === "ois") {
      const fwd = parseBoeWorkbook(bytes, "fwdShort");
      if (fwd) {
        const rows = Object.fromEntries(Object.entries(fwd.rows).filter(([d]) => !sinceDate || d >= sinceDate));
        if (Object.keys(rows).length) {
          const fresh: CurveSet = { ...OIS_FWD, source: "Bank of England yield curves", basis: "fwd_inst", tenors: fwd.tenors, rows };
          const prev = into.get("ois_fwd");
          into.set("ois_fwd", prev ? mergeSameSource(prev, fresh) : fresh);
        }
      } else console.warn(`  BoE: no short-end forward sheet in ${name}`);
    }
    const parsed = parseBoeWorkbook(bytes);
    if (!parsed) {
      console.warn(`  BoE: no spot curve sheet in ${name}`);
      continue;
    }
    const rows = Object.fromEntries(
      Object.entries(parsed.rows).filter(([d]) => !sinceDate || d >= sinceDate),
    );
    if (!Object.keys(rows).length) continue;
    const fresh: CurveSet = {
      ...META[kind],
      source: "Bank of England yield curves",
      // BoE fitted spot curves are treated as continuously compounded (see README).
      basis: "zero_cc",
      tenors: parsed.tenors,
      rows,
    };
    const prev = into.get(kind);
    into.set(kind, prev ? mergeSameSource(prev, fresh) : fresh);
  }
}

// Archive workbooks for different eras can use different tenor grids; keep the union.
function mergeSameSource(a: CurveSet, b: CurveSet): CurveSet {
  if (a.tenors.join() === b.tenors.join()) return { ...a, rows: { ...a.rows, ...b.rows } };
  const tenors = [...new Set([...a.tenors, ...b.tenors])].sort((x, y) => x - y);
  const remap = (s: CurveSet) =>
    Object.fromEntries(
      Object.entries(s.rows).map(([d, r]) => [d, tenors.map((t) => r[s.tenors.indexOf(t)] ?? null)]),
    );
  return { ...a, tenors, rows: { ...remap(a), ...remap(b) } };
}

export async function fetchBoe(opts: { backfillSince?: string } = {}): Promise<CurveSet[]> {
  const out = new Map<BoeCurveKind | "ois_fwd", CurveSet>();
  if (opts.backfillSince) {
    for (const url of ARCHIVES) {
      try {
        collect(await getBytes(url), out, opts.backfillSince);
      } catch (e) {
        console.warn(`  BoE archive ${url} failed: ${(e as Error).message}`);
      }
    }
  }
  collect(await getBytes(LATEST), out);
  if (!out.size) throw new Error("BoE zip contained no recognisable curve workbooks");
  return [...out.values()];
}
