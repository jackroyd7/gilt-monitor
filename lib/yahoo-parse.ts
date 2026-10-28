// Yahoo Finance quoteSummary → our metrics, profile, analyst and earnings shapes. Pure, so it
// can be tested; the fetching is in yahoo-summary.ts.
import type { StockMetrics } from "./stock-metrics";

type Raw =
  | { raw?: unknown; fmt?: unknown }
  | number
  | string
  | undefined
  | null;
const num = (v: Raw): number | undefined => {
  const x = typeof v === "object" && v !== null ? v.raw : v;
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
};
const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const date = (v: Raw) => {
  const t = num(v);
  return t != null ? new Date(t * 1000).toISOString().slice(0, 10) : undefined;
};

export interface YahooSummary {
  metrics: StockMetrics | null;
  currency?: string;
  /** Currency the accounts are in (market cap and EV are in the quote currency's major unit). */
  financialCurrency?: string;
  profile: {
    sector?: string;
    industry?: string;
    country?: string;
    web?: string;
    employees?: number;
    summary?: string;
    name?: string;
  };
  recs: {
    period: string;
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  }[];
  results: {
    period: string;
    actual?: number;
    estimate?: number;
    surprisePct?: number;
  }[];
  next: { date: string } | null;
  target?: { mean: number; analysts?: number };
}

/** `now` dates Yahoo's relative recommendation periods ("0m", "-1m", …). */
export function parseYahooSummary(
  json: unknown,
  now = new Date(),
): YahooSummary | null {
  const r = (
    json as {
      quoteSummary?: { result?: Record<string, Record<string, unknown>>[] };
    }
  )?.quoteSummary?.result?.[0];
  if (!r) return null;
  const p = (r.price ?? {}) as Record<string, Raw>;
  const s = (r.summaryDetail ?? {}) as Record<string, Raw>;
  const k = (r.defaultKeyStatistics ?? {}) as Record<string, Raw>;
  const f = (r.financialData ?? {}) as Record<string, Raw>;
  const a = (r.assetProfile ?? {}) as Record<string, unknown>;

  const m: StockMetrics = {
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
    grossMargin: num(f.grossMargins),
    operatingMargin: num(f.operatingMargins),
    profitMargin: num(f.profitMargins) ?? num(k.profitMargins),
    returnOnEquity: num(f.returnOnEquity),
    revenueGrowth: num(f.revenueGrowth),
    earningsGrowth: num(f.earningsGrowth),
    // Yahoo quotes debt/equity as a percentage (150 = 1.5x).
    debtToEquity:
      num(f.debtToEquity) != null ? num(f.debtToEquity)! / 100 : undefined,
    currentRatio: num(f.currentRatio),
    eps: num(k.trailingEps),
    beta: num(s.beta) ?? num(k.beta),
  };
  for (const key of Object.keys(m) as (keyof StockMetrics)[])
    if (m[key] === undefined) delete m[key];

  const trend = (
    (r.recommendationTrend as { trend?: Record<string, unknown>[] } | undefined)
      ?.trend ?? []
  ).flatMap((t) => {
    const back = Number(String(t.period ?? "").replace("m", ""));
    if (!Number.isFinite(back)) return [];
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + back, 1),
    );
    const n = (x: unknown) => (typeof x === "number" ? x : 0);
    const row = {
      period: d.toISOString().slice(0, 10),
      strongBuy: n(t.strongBuy),
      buy: n(t.buy),
      hold: n(t.hold),
      sell: n(t.sell),
      strongSell: n(t.strongSell),
    };
    return row.strongBuy + row.buy + row.hold + row.sell + row.strongSell
      ? [row]
      : [];
  });

  const results = (
    (r.earningsHistory as { history?: Record<string, Raw>[] } | undefined)
      ?.history ?? []
  )
    .flatMap((h) => {
      const period = date(h.quarter);
      const actual = num(h.epsActual);
      if (!period || actual == null) return [];
      const sp = num(h.surprisePercent);
      return [
        {
          period,
          actual,
          estimate: num(h.epsEstimate),
          surprisePct: sp != null ? sp * 100 : undefined,
        },
      ];
    })
    .sort((x, y) => y.period.localeCompare(x.period));

  const today = now.toISOString().slice(0, 10);
  const nextDate = (
    ((r.calendarEvents as { earnings?: { earningsDate?: Raw[] } } | undefined)
      ?.earnings?.earningsDate ?? []) as Raw[]
  )
    .map(date)
    .filter((d): d is string => !!d && d >= today)
    .sort()[0];

  const target = num(f.targetMeanPrice);
  const employees =
    typeof a.fullTimeEmployees === "number" ? a.fullTimeEmployees : undefined;
  return {
    metrics: Object.keys(m).length ? m : null,
    currency: str(p.currency) ?? str(s.currency),
    financialCurrency: str(f.financialCurrency),
    profile: {
      name: str(p.longName) ?? str(p.shortName),
      sector: str(a.sector),
      industry: str(a.industry),
      country: str(a.country),
      web: str(a.website),
      employees,
      summary: str(a.longBusinessSummary),
    },
    recs: trend.sort((x, y) => y.period.localeCompare(x.period)),
    results,
    next: nextDate ? { date: nextDate } : null,
    target:
      target != null
        ? { mean: target, analysts: num(f.numberOfAnalystOpinions) }
        : undefined,
  };
}
