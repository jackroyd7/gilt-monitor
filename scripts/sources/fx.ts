import { COT_CONTRACTS, FX_SERIES, parseCot, parseIadbCsv, type CotHistory, type FxHistory } from "../../lib/fx";
import { getText } from "./http";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const boeDate = (iso: string) => `${iso.slice(8, 10)}/${MON[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;

/** BoE daily spot rates (4pm London) and the sterling effective exchange rate index. */
export async function fetchBoeFx(since: string): Promise<FxHistory> {
  const codes = FX_SERIES.map((s) => s.code);
  const url =
    process.env.BOE_IADB_URL ??
    "https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes" +
      `&Datefrom=${boeDate(since)}&Dateto=now&SeriesCodes=${codes.join(",")}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  const rows = parseIadbCsv(await getText(url, "text/csv"), codes);
  if (!Object.keys(rows).length) throw new Error("BoE FX CSV had no rows");
  return { source: "Bank of England database (spot rates, 4pm London)", series: FX_SERIES.map((s) => s.id), rows };
}

/** CFTC Traders in Financial Futures (futures only), weekly, from the public reporting API. */
export async function fetchCot(since: string): Promise<CotHistory> {
  const codes = COT_CONTRACTS.map((c) => `'${c.code}'`).join(",");
  const base = process.env.CFTC_TFF_URL ?? "https://publicreporting.cftc.gov/resource/gpe5-46if.json";
  const q = new URLSearchParams({
    $where: `cftc_contract_market_code in(${codes}) AND report_date_as_yyyy_mm_dd >= '${since}T00:00:00'`,
    $order: "report_date_as_yyyy_mm_dd",
    $limit: "5000",
  });
  const records = JSON.parse(await getText(`${base}?${q}`, "application/json")) as Record<string, unknown>[];
  if (!Array.isArray(records)) throw new Error("CFTC API did not return a list");
  const rows = parseCot(records);
  if (!Object.keys(rows).length) throw new Error(`CFTC API returned ${records.length} records, none usable`);
  return { source: "CFTC Traders in Financial Futures (futures only)", rows };
}
