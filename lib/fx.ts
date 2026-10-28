// FX data: Bank of England daily spot rates (4pm London) and CFTC futures positioning,
// plus the analytics the FX tab shows. Pure functions; the data job and pages share them.

/** BoE database series, in the column order stored in data/fx.json. */
export const FX_SERIES = [
  { id: "GBPUSD", code: "XUDLUSS", name: "GBP/USD", digits: 4 },
  { id: "GBPEUR", code: "XUDLERS", name: "GBP/EUR", digits: 4 },
  { id: "GBPJPY", code: "XUDLJYS", name: "GBP/JPY", digits: 2 },
  { id: "GBPCHF", code: "XUDLSFS", name: "GBP/CHF", digits: 4 },
  { id: "ERI", code: "XUDLBK67", name: "Sterling index", digits: 2 },
] as const;
export type FxId = (typeof FX_SERIES)[number]["id"];

export interface FxHistory {
  source: string;
  series: FxId[];
  /** rows[date][i] is series[i] on that date (null if not published). */
  rows: Record<string, (number | null)[]>;
}

/** CFTC "Traders in Financial Futures" contracts we follow. */
export const COT_CONTRACTS = [
  { id: "GBP", code: "096742", name: "British pound" },
  { id: "EUR", code: "099741", name: "Euro" },
  { id: "JPY", code: "097741", name: "Japanese yen" },
  { id: "CHF", code: "092741", name: "Swiss franc" },
] as const;
export type CotId = (typeof COT_CONTRACTS)[number]["id"];

/** One weekly report: open interest and long/short contracts by trader group. */
export interface CotRow {
  oi: number;
  amLong: number;
  amShort: number;
  levLong: number;
  levShort: number;
}
export interface CotHistory {
  source: string;
  /** rows[contract][date] (report date, positions as of that Tuesday). */
  rows: Partial<Record<CotId, Record<string, CotRow>>>;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "02 Jan 2024" → "2024-01-02". */
function iadbDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[\s/-]([A-Za-z]{3})[a-z]*[\s/-](\d{4})$/);
  if (!m) return null;
  const mm = MONTHS[m[2].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[1].padStart(2, "0")}` : null;
}

/**
 * Parses a BoE database CSV export (one DATE column, then one column per series code) into
 * rows ordered like `codes`. Unknown columns are ignored; missing values become null.
 */
export function parseIadbCsv(csv: string, codes: readonly string[]): Record<string, (number | null)[]> {
  if (/<html/i.test(csv.slice(0, 500))) throw new Error("BoE database returned a web page instead of CSV");
  const lines = csv.split(/\r?\n/).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  const h = lines.findIndex((l) => l[0]?.toUpperCase() === "DATE");
  if (h < 0) throw new Error("No DATE header in BoE CSV");
  const idx = codes.map((c) => lines[h].findIndex((x) => x.toUpperCase() === c.toUpperCase()));
  if (idx.every((i) => i < 0)) throw new Error("None of the requested series are in the BoE CSV");
  const rows: Record<string, (number | null)[]> = {};
  for (const l of lines.slice(h + 1)) {
    const d = iadbDate(l[0] ?? "");
    if (!d) continue;
    rows[d] = idx.map((i) => {
      const v = i < 0 ? NaN : Number(l[i]);
      return l[i] && Number.isFinite(v) ? v : null;
    });
  }
  return rows;
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Field-name patterns for the two trader groups a CFTC report is read for. */
export interface CotFields {
  aLong: RegExp;
  aShort: RegExp;
  bLong: RegExp;
  bShort: RegExp;
}
const TFF_FIELDS: CotFields = {
  aLong: /^asset_mgr_positions_long(_all)?$/,
  aShort: /^asset_mgr_positions_short(_all)?$/,
  bLong: /^lev_money_positions_long(_all)?$/,
  bShort: /^lev_money_positions_short(_all)?$/,
};

/**
 * Parses CFTC public-reporting JSON (Socrata) rows, finding fields by name pattern.
 * Group "a" is stored as amLong/amShort and group "b" as levLong/levShort.
 */
export function parseCotWith<Id extends string>(
  records: Record<string, unknown>[],
  contracts: readonly { id: Id; code: string }[],
  fields: CotFields,
): Partial<Record<Id, Record<string, CotRow>>> {
  const out: Partial<Record<Id, Record<string, CotRow>>> = {};
  for (const r of records) {
    const code = String(r.cftc_contract_market_code ?? "").trim();
    const c = contracts.find((x) => x.code === code);
    const date = String(r.report_date_as_yyyy_mm_dd ?? "").slice(0, 10);
    if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const field = (re: RegExp) => num(Object.entries(r).find(([k]) => re.test(k))?.[1]);
    const row = {
      oi: field(/^open_interest_all$/),
      amLong: field(fields.aLong),
      amShort: field(fields.aShort),
      levLong: field(fields.bLong),
      levShort: field(fields.bShort),
    };
    if (Object.values(row).some((v) => v == null)) continue;
    const byDate: Record<string, CotRow> = out[c.id] ?? {};
    byDate[date] = row as CotRow;
    out[c.id] = byDate as (typeof out)[Id];
  }
  return out;
}

/** Traders in Financial Futures: asset managers ("a") and leveraged funds ("b"). */
export const parseCot = (records: Record<string, unknown>[]): CotHistory["rows"] => parseCotWith(records, COT_CONTRACTS, TFF_FIELDS);

// ---------- analytics ----------

export type Point = [string, number];

/** One series of the FX history as [date, value] points, oldest first. */
export function fxSeries(h: FxHistory | undefined, id: FxId): Point[] {
  if (!h) return [];
  const i = h.series.indexOf(id);
  if (i < 0) return [];
  return Object.keys(h.rows)
    .sort()
    .flatMap((d) => {
      const v = h.rows[d][i];
      return v == null ? [] : [[d, v] as Point];
    });
}

/** Last value on or before `date`. */
export function valueOnOrBefore(points: Point[], date: string): number | null {
  let lo = 0;
  let hi = points.length - 1;
  let best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= date) {
      best = points[mid][1];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

const shift = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Percentage change from a past date (days back, or "ytd") to the latest point. */
export function pctChange(points: Point[], back: number | "ytd"): number | null {
  if (points.length < 2) return null;
  const [lastDate, last] = points[points.length - 1];
  const from = back === "ytd" ? `${Number(lastDate.slice(0, 4)) - 1}-12-31` : shift(lastDate, -back);
  const base = valueOnOrBefore(points, from);
  return base ? (last / base - 1) * 100 : null;
}

const logReturns = (points: Point[]): Point[] =>
  points.slice(1).map((p, i) => [p[0], Math.log(p[1] / points[i][1])]);

const stdev = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Annualised close-to-close volatility (%) over the last `window` daily returns. */
export function realisedVol(points: Point[], window: number): number | null {
  const r = logReturns(points).slice(-window).map((p) => p[1]);
  return r.length >= Math.min(window, 10) ? stdev(r) * Math.sqrt(252) * 100 : null;
}

/** Rolling annualised volatility (%) as a series. */
export function rollingVol(points: Point[], window: number): Point[] {
  const r = logReturns(points);
  const out: Point[] = [];
  for (let i = window - 1; i < r.length; i++) out.push([r[i][0], stdev(r.slice(i - window + 1, i + 1).map((p) => p[1])) * Math.sqrt(252) * 100]);
  return out;
}

const corr = (a: number[], b: number[]) => {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
};

/**
 * Rolling correlation of daily changes in two series (FX % change vs spread change),
 * on the dates both have.
 */
export function rollingCorrelation(fx: Point[], spread: Point[], window: number): Point[] {
  const s = new Map(spread);
  const both = fx.filter((p) => s.has(p[0]));
  const dx: number[] = [];
  const dy: number[] = [];
  const dates: string[] = [];
  for (let i = 1; i < both.length; i++) {
    dx.push(Math.log(both[i][1] / both[i - 1][1]));
    dy.push(s.get(both[i][0])! - s.get(both[i - 1][0])!);
    dates.push(both[i][0]);
  }
  const out: Point[] = [];
  for (let i = window - 1; i < dx.length; i++) out.push([dates[i], corr(dx.slice(i - window + 1, i + 1), dy.slice(i - window + 1, i + 1))]);
  return out;
}

/** Net long contracts for each trader group, oldest first. */
export function cotNet(rows: Record<string, CotRow> | undefined) {
  return Object.keys(rows ?? {})
    .sort()
    .map((d) => {
      const r = rows![d];
      return { date: d, assetManagers: r.amLong - r.amShort, leveraged: r.levLong - r.levShort, oi: r.oi };
    });
}
