// Valuation and fundamental metrics per stock, from Finnhub's "basic financials"
// (/stock/metric?metric=all). Pure helpers, shared by the server fetcher and tests.

export interface StockMetrics {
  /** Absolute amounts in the listing's currency. */
  marketCap?: number;
  enterpriseValue?: number;
  trailingPE?: number;
  forwardPE?: number;
  pegRatio?: number;
  priceToBook?: number;
  priceToSales?: number;
  evToEbitda?: number;
  evToRevenue?: number;
  /** Fractions: 0.041 = 4.1%. */
  dividendYield?: number;
  payoutRatio?: number;
  grossMargin?: number;
  operatingMargin?: number;
  profitMargin?: number;
  returnOnEquity?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  /** Ratios: 1.5 = 1.5x. */
  debtToEquity?: number;
  currentRatio?: number;
  eps?: number;
  beta?: number;
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Finnhub /stock/metric?metric=all → our metrics. Finnhub quotes percentages as 4.1 and amounts in millions. */
export function parseFinnhubMetric(json: unknown): StockMetrics | null {
  const m = (json as { metric?: Record<string, unknown> })?.metric;
  if (!m || typeof m !== "object") return null;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = num(m[k]);
      if (v !== undefined) return v;
    }
    return undefined;
  };
  const pct = (...keys: string[]) => {
    const v = pick(...keys);
    return v === undefined ? undefined : v / 100;
  };
  const mn = (...keys: string[]) => {
    const v = pick(...keys);
    return v === undefined ? undefined : v * 1e6;
  };
  const out: StockMetrics = {
    marketCap: mn("marketCapitalization"),
    enterpriseValue: mn("enterpriseValue"),
    trailingPE: pick(
      "peTTM",
      "peBasicExclExtraTTM",
      "peExclExtraTTM",
      "peNormalizedAnnual",
    ),
    forwardPE: pick("forwardPE", "peForward"),
    pegRatio: pick("pegTTM", "pegRatio"),
    priceToBook: pick("pb", "pbQuarterly", "pbAnnual"),
    priceToSales: pick("psTTM", "psAnnual"),
    evToEbitda: pick("evEbitdaTTM", "currentEv/ebitdaTTM", "evEbitdaAnnual"),
    evToRevenue: pick(
      "evRevenueTTM",
      "currentEv/revenueTTM",
      "evRevenueAnnual",
    ),
    dividendYield: pct(
      "currentDividendYieldTTM",
      "dividendYieldIndicatedAnnual",
    ),
    payoutRatio: pct("payoutRatioTTM", "payoutRatioAnnual"),
    grossMargin: pct("grossMarginTTM", "grossMarginAnnual"),
    operatingMargin: pct("operatingMarginTTM", "operatingMarginAnnual"),
    profitMargin: pct("netProfitMarginTTM", "netProfitMarginAnnual"),
    returnOnEquity: pct("roeTTM", "roeRfy"),
    revenueGrowth: pct("revenueGrowthTTMYoy", "revenueGrowthQuarterlyYoy"),
    earningsGrowth: pct("epsGrowthTTMYoy", "epsGrowthQuarterlyYoy"),
    debtToEquity: pick(
      "totalDebt/totalEquityQuarterly",
      "totalDebt/totalEquityAnnual",
    ),
    currentRatio: pick("currentRatioQuarterly", "currentRatioAnnual"),
    eps: pick("epsTTM", "epsBasicExclExtraItemsTTM", "epsExclExtraItemsTTM"),
    beta: pick("beta"),
  };
  for (const k of Object.keys(out) as (keyof StockMetrics)[])
    if (out[k] === undefined) delete out[k];
  return Object.keys(out).length ? out : null;
}

const SYMBOLS: Record<string, string> = {
  GBP: "£",
  GBp: "£",
  GBX: "£",
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

/** 2.31tn / 456bn / 12.3m with a currency sign. */
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
  return `${sign}${ccySign(currency)}${n.toFixed(digits)}${unit}`;
}

/** Share counts and volumes: 1.2bn, 34.5m, 980k. */
export function fmtCount(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}bn`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}m`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return v.toFixed(0);
}
