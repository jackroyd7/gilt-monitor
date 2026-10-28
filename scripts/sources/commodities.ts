import * as XLSX from "xlsx";
import { COMMODITY_COT, COMMODITY_SERIES, DISAGG_FIELDS, parseEiaSheet, type CommodityData } from "../../lib/commodities";
import { parseCotWith } from "../../lib/fx";
import { parseFredCsv } from "../../lib/macro";
import { getBytes, getText } from "./http";

/** EIA weekly/daily history workbook, keyless: https://www.eia.gov/dnav/pet/hist_xls/<ID>w.xls */
async function eiaXls(id: string): Promise<[string, number][]> {
  const wb = XLSX.read(await getBytes(`https://www.eia.gov/dnav/pet/hist_xls/${id}w.xls`), { cellDates: true });
  const sheet = wb.Sheets["Data 1"] ?? wb.Sheets[wb.SheetNames[1]];
  if (!sheet) throw new Error("no data sheet in EIA workbook");
  return parseEiaSheet(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }));
}

/** FRED prices (5 years) and CFTC disaggregated positions (3 years). Keeps old data for any part that fails. */
/** Daily closes of a Yahoo Finance future (continuous front month). */
async function yahooDaily(symbol: string, since: string): Promise<[string, number][]> {
  const r = (JSON.parse(await getText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`, "application/json")) as {
    chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
  }).chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  return ts
    .flatMap((t, i) => (closes[i] == null ? [] : [[new Date(t * 1000).toISOString().slice(0, 10), +closes[i]!.toFixed(3)] as [string, number]]))
    .filter(([d]) => d >= since);
}

export async function fetchCommodities(previous: CommodityData | undefined, since: string, cotSince: string) {
  const prices: CommodityData["prices"] = { ...(previous?.prices ?? {}) };
  const sources: NonNullable<CommodityData["sources"]> = { ...(previous?.sources ?? {}) };
  const failures: string[] = [];
  for (const s of COMMODITY_SERIES) {
    if (s.yahoo) {
      try {
        const pts = await yahooDaily(s.yahoo, since);
        if (pts.length < 100) throw new Error(`only ${pts.length} rows`);
        prices[s.id] = pts;
        sources[s.id] = `Yahoo ${s.yahoo} (front-month future)`;
        console.log(`  ${s.id}: Yahoo ${s.yahoo} ${pts.at(-1)!.join(" ")} (${pts.length} pts)`);
        continue;
      } catch (e) {
        console.warn(`  ${s.id}: Yahoo ${s.yahoo} failed (${(e as Error).message}); using FRED spot`);
      }
    }
    try {
      let pts = s.fred
        ? parseFredCsv(await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${s.fred}&cosd=${since}`, "text/csv"))
        : (await eiaXls(s.eia!)).filter(([d]) => d >= since);
      if (s.id === "CRUDE_STOCKS") pts = pts.map(([d, v]) => [d, v / 1000]); // thousand barrels → million
      if (!pts.length) throw new Error("no rows");
      prices[s.id] = pts;
      sources[s.id] = s.fred ? `FRED ${s.fred} (EIA spot)` : `EIA ${s.eia}`;
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
  const data: CommodityData = { updatedAt: new Date().toISOString(), prices, sources, cot };
  return { data, failures };
}
