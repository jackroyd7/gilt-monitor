import { COMMODITY_COT, COMMODITY_SERIES, DISAGG_FIELDS, type CommodityData } from "../../lib/commodities";
import { parseCotWith } from "../../lib/fx";
import { parseFredCsv } from "../../lib/macro";
import { getText } from "./http";

/** FRED prices (5 years) and CFTC disaggregated positions (3 years). Keeps old data for any part that fails. */
export async function fetchCommodities(previous: CommodityData | undefined, since: string, cotSince: string) {
  const prices: CommodityData["prices"] = { ...(previous?.prices ?? {}) };
  const failures: string[] = [];
  for (const s of COMMODITY_SERIES) {
    try {
      let pts = parseFredCsv(await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${s.fred}&cosd=${since}`, "text/csv"));
      if (s.id === "CRUDE_STOCKS") pts = pts.map(([d, v]) => [d, v / 1000]); // thousand barrels → million
      if (!pts.length) throw new Error("no rows");
      prices[s.id] = pts;
      console.log(`  ${s.id}: ${pts[pts.length - 1].join(" ")} (${pts.length} pts)`);
    } catch (e) {
      failures.push(`${s.id}: ${(e as Error).message}`);
    }
  }
  let cot = previous?.cot ?? {};
  try {
    const codes = COMMODITY_COT.map((c) => `'${c.code}'`).join(",");
    const q = new URLSearchParams({
      $where: `cftc_contract_market_code in(${codes}) AND report_date_as_yyyy_mm_dd >= '${cotSince}T00:00:00'`,
      $order: "report_date_as_yyyy_mm_dd",
      $limit: "10000",
    });
    const base = process.env.CFTC_DISAGG_URL ?? "https://publicreporting.cftc.gov/resource/72hh-3qpy.json";
    const records = JSON.parse(await getText(`${base}?${q}`, "application/json")) as Record<string, unknown>[];
    const parsed = parseCotWith(records, COMMODITY_COT, DISAGG_FIELDS);
    console.log(`  CFTC disaggregated: ${records.length} records; ${Object.keys(parsed).join(", ") || "none parsed"}`);
    if (!Object.keys(parsed).length && records[0]) console.log(`  first record keys: ${Object.keys(records[0]).join(", ")}`);
    if (Object.keys(parsed).length) cot = parsed;
    else failures.push("CFTC: no usable records");
  } catch (e) {
    failures.push(`CFTC: ${(e as Error).message}`);
  }
  const data: CommodityData = { updatedAt: new Date().toISOString(), prices, cot };
  return { data, failures };
}
