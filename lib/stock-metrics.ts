// Valuation, pricing and fundamental metrics per stock, from Yahoo Finance's quote summary.
// The data job fetches them once a day into data/stock-metrics.json.

export const METRIC_KEYS = [
  "price",
  "marketCap",
  "enterpriseValue",
  "trailingPE",
  "forwardPE",
  "pegRatio",
  "priceToBook",
  "priceToSales",
  "evToEbitda",
  "evToRevenue",
  "dividendYield",
  "payoutRatio",
  "beta",
  "high52",
  "low52",
  "avg50",
  "avg200",
  "avgVolume",
  "sharesOutstanding",
  "shortPctFloat",
  "targetMean",
  "analysts",
  "profitMargin",
  "operatingMargin",
  "returnOnEquity",
  "revenueGrowth",
  "earningsGrowth",
  "debtToEquity",
  "totalCash",
  "totalDebt",
  "freeCashflow",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export type StockMetrics = Partial<Record<MetricKey, number>> & {
  /** Currency of the share price (GBp for most LSE listings). */
  currency?: string;
  /** Currency the accounts are reported in (cash, debt, free cash flow). */
  financialCurrency?: string;
  /** Analysts' consensus, e.g. "buy", "hold". */
  recommendation?: string;
  /** When fetched, ISO. */
  asOf: string;
};

export interface StockMetricsFile {
  updatedAt: string;
  stocks: Record<string, StockMetrics>;
}

type Raw = { raw?: unknown } | number | undefined | null;
const num = (v: Raw): number | undefined => {
  const x = typeof v === "object" && v !== null ? v.raw : v;
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
};

/** Yahoo v10 quoteSummary (modules price, summaryDetail, defaultKeyStatistics, financialData) → metrics. */
export function parseQuoteSummary(
  json: unknown,
  asOf: string,
): StockMetrics | null {
  const r = (
    json as {
      quoteSummary?: {
        result?: Record<string, Record<string, Raw | string>>[];
      };
    }
  ).quoteSummary?.result?.[0];
  if (!r) return null;
  const p = (r.price ?? {}) as Record<string, Raw>;
  const s = (r.summaryDetail ?? {}) as Record<string, Raw>;
  const k = (r.defaultKeyStatistics ?? {}) as Record<string, Raw>;
  const f = (r.financialData ?? {}) as Record<string, Raw | string>;
  const fin = (key: string) => num(f[key] as Raw);
  const m: StockMetrics = {
    asOf,
    price: num(p.regularMarketPrice),
    marketCap: num(p.marketCap) ?? num(s.marketCap),
    enterpriseValue: num(k.enterpriseValue),
    trailingPE: num(s.trailingPE),
    forwardPE: num(s.forwardPE) ?? num(k.forwardPE),
    pegRatio: num(k.pegRatio) ?? num(k.trailingPegRatio),
    priceToBook: num(k.priceToBook),
    priceToSales: num(s.priceToSalesTrailing12Months),
    evToEbitda: num(k.enterpriseToEbitda),
    evToRevenue: num(k.enterpriseToRevenue),
    dividendYield: num(s.dividendYield) ?? num(s.trailingAnnualDividendYield),
    payoutRatio: num(s.payoutRatio),
    beta: num(s.beta) ?? num(k.beta),
    high52: num(s.fiftyTwoWeekHigh),
    low52: num(s.fiftyTwoWeekLow),
    avg50: num(s.fiftyDayAverage),
    avg200: num(s.twoHundredDayAverage),
    avgVolume: num(s.averageVolume),
    sharesOutstanding: num(k.sharesOutstanding),
    shortPctFloat: num(k.shortPercentOfFloat),
    targetMean: fin("targetMeanPrice"),
    analysts: fin("numberOfAnalystOpinions"),
    profitMargin: fin("profitMargins") ?? num(k.profitMargins),
    operatingMargin: fin("operatingMargins"),
    returnOnEquity: fin("returnOnEquity"),
    revenueGrowth: fin("revenueGrowth"),
    earningsGrowth: fin("earningsGrowth"),
    // Yahoo quotes debt/equity as a percentage (e.g. 150 = 1.5x).
    debtToEquity: fin("debtToEquity"),
    totalCash: fin("totalCash"),
    totalDebt: fin("totalDebt"),
    freeCashflow: fin("freeCashflow"),
  };
  const ccy =
    typeof p.currency === "string"
      ? p.currency
      : typeof s.currency === "string"
        ? s.currency
        : undefined;
  if (ccy) m.currency = ccy;
  if (typeof f.financialCurrency === "string")
    m.financialCurrency = f.financialCurrency;
  if (typeof f.recommendationKey === "string" && f.recommendationKey !== "none")
    m.recommendation = f.recommendationKey.replace(/_/g, " ");
  for (const key of METRIC_KEYS) if (m[key] === undefined) delete m[key];
  // Nothing useful came back (an unknown symbol returns an empty shell).
  if (m.marketCap == null && m.trailingPE == null && m.high52 == null)
    return null;
  return m;
}

/** Median of a metric across a set of stocks, ignoring gaps and non-positive multiples. */
export function median(values: (number | undefined)[]): number | undefined {
  const v = values
    .filter((x): x is number => x != null && Number.isFinite(x) && x > 0)
    .sort((a, b) => a - b);
  if (v.length < 3) return undefined;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const SYMBOLS: Record<string, string> = {
  GBP: "£",
  GBp: "£",
  USD: "$",
  EUR: "€",
  JPY: "¥",
  CNY: "¥",
  HKD: "HK$",
  KRW: "₩",
  TWD: "NT$",
  CHF: "CHF ",
};

export const ccySign = (currency?: string) =>
  currency ? (SYMBOLS[currency] ?? `${currency} `) : "";

/** 2.31tn / 456bn / 12.3m with a currency sign; LSE's pence-quoted caps are still in pounds. */
export function fmtMoney(v: number, currency?: string): string {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  const [n, unit] =
    a >= 1e12
      ? [a / 1e12, "tn"]
      : a >= 1e9
        ? [a / 1e9, "bn"]
        : a >= 1e6
          ? [a / 1e6, "m"]
          : [a, ""];
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  const cur = ccySign(currency);
  return `${sign}${cur}${n.toFixed(digits)}${unit}`;
}

/** Share counts and volumes: 1.2bn, 34.5m, 980k. */
export function fmtCount(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}bn`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}m`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return v.toFixed(0);
}
