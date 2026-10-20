import { parseUstCsv } from "../../lib/parsers";
import type { CurveSet } from "../../lib/types";
import { getText } from "./http";

const url = (year: number) =>
  `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all` +
  `?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;

export async function fetchUst(opts: { backfillSince?: string } = {}): Promise<CurveSet> {
  const thisYear = new Date().getUTCFullYear();
  const firstYear = opts.backfillSince ? Number(opts.backfillSince.slice(0, 4)) : thisYear - 1;
  let tenors: number[] = [];
  const rows: CurveSet["rows"] = {};
  for (let y = firstYear; y <= thisYear; y++) {
    const parsed = parseUstCsv(await getText(url(y), "text/csv"));
    // The grid changes over time (e.g. 4-month bills added in 2022); align to the newest.
    if (parsed.tenors.length >= tenors.length) {
      for (const [d, r] of Object.entries(rows)) rows[d] = parsed.tenors.map((t) => r[tenors.indexOf(t)] ?? null);
      tenors = parsed.tenors;
    }
    for (const [d, r] of Object.entries(parsed.rows)) {
      rows[d] = tenors.map((t) => r[parsed.tenors.indexOf(t)] ?? null);
    }
  }
  if (!Object.keys(rows).length) throw new Error("US Treasury CSV had no rows");
  return {
    id: "us_ust",
    label: "US Treasury par",
    source: "US Treasury daily par yield curve",
    basis: "par_semiannual",
    tenors,
    rows,
  };
}
