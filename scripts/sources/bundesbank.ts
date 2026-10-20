import { addDays } from "../../lib/curve";
import { parseBundesbankSdmxCsv } from "../../lib/parsers";
import type { CurveSet } from "../../lib/types";
import { getText } from "./http";

// BBSIS: Svensson-fitted zero-coupon yields on listed Federal securities, residual maturity 1-30y.
const maturities = Array.from({ length: 30 }, (_, i) => `R${String(i + 1).padStart(2, "0")}XX`).join("+");
const KEY = `D.I.ZST.ZI.EUR.S1311.B.A604.${maturities}.R.A.A._Z._Z.A`;

export async function fetchBundesbank(opts: { backfillSince?: string } = {}): Promise<CurveSet> {
  const since = opts.backfillSince ?? addDays(new Date().toISOString().slice(0, 10), -60);
  const url = `https://api.statistiken.bundesbank.de/rest/data/BBSIS/${KEY}?startPeriod=${since}`;
  const text = await getText(url, "application/vnd.sdmx.data+csv;version=1.0.0");
  const parsed = parseBundesbankSdmxCsv(text);
  if (!parsed.tenors.length) throw new Error("Bundesbank response had no recognisable observations");
  return {
    id: "de_bund",
    label: "German Bund zero",
    source: "Deutsche Bundesbank (BBSIS Svensson)",
    basis: "zero_annual",
    ...parsed,
  };
}
