import "server-only";
import { finnhubKey } from "./earnings-fetch";
import { parseFinnhubMetric, type StockMetrics } from "./stock-metrics";

// Company data from Finnhub's free API (key in FINNHUB_API_KEY). Responses are cached per
// process; the free plan allows 60 calls a minute.
const BASE = (
  process.env.FINNHUB_BASE_URL ?? "https://finnhub.io/api/v1"
).replace(/\/$/, "");

type Entry = { at: number; ttl: number; value: unknown };
const cache = ((
  globalThis as { __giltFinnhub?: Map<string, Entry> }
).__giltFinnhub ??= new Map());

/** One Finnhub call; null when there's no key, no access on the free plan, or an error. */
async function fh<T>(
  path: string,
  params: Record<string, string>,
  ttlMs: number,
): Promise<T | null> {
  const key = finnhubKey();
  if (!key) return null;
  const qs = new URLSearchParams(params).toString();
  const id = `${path}?${qs}`;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
  try {
    const res = await fetch(`${BASE}${path}?${qs}`, {
      headers: { "X-Finnhub-Token": key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // 403: not on the free plan for this market. Remember that for a while.
      if (res.status === 403)
        cache.set(id, { at: Date.now(), ttl: ttlMs, value: null });
      return (hit?.value as T) ?? null;
    }
    const value = (await res.json()) as T;
    if (cache.size > 2000) cache.clear();
    cache.set(id, { at: Date.now(), ttl: ttlMs, value });
    return value;
  } catch {
    return (hit?.value as T) ?? null;
  }
}

const H = 3600_000;
const n = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

export interface FinnhubSearchHit {
  symbol: string;
  description: string;
  type: string;
}

export async function searchFinnhub(
  q: string,
): Promise<FinnhubSearchHit[] | null> {
  const r = await fh<{ result?: Record<string, unknown>[] }>(
    "/search",
    { q },
    12 * H,
  );
  if (!r) return null;
  return (r.result ?? []).flatMap((x) => {
    const symbol = str(x.symbol);
    return symbol
      ? [
          {
            symbol,
            description: str(x.description) ?? symbol,
            type: str(x.type) ?? "",
          },
        ]
      : [];
  });
}

export interface CompanyProfile {
  name?: string;
  country?: string;
  currency?: string;
  exchange?: string;
  industry?: string;
  ipo?: string;
  logo?: string;
  web?: string;
  /** Absolute amounts in the listing currency. */
  marketCap?: number;
  shares?: number;
}

export async function companyProfile(
  symbol: string,
): Promise<CompanyProfile | null> {
  const r = await fh<Record<string, unknown>>(
    "/stock/profile2",
    { symbol },
    24 * H,
  );
  if (!r || !Object.keys(r).length) return null;
  const cap = n(r.marketCapitalization);
  const shares = n(r.shareOutstanding);
  return {
    name: str(r.name),
    country: str(r.country),
    currency: str(r.currency),
    exchange: str(r.exchange),
    industry: str(r.finnhubIndustry),
    ipo: str(r.ipo),
    logo: str(r.logo),
    web: str(r.weburl),
    marketCap: cap != null ? cap * 1e6 : undefined,
    shares: shares != null ? shares * 1e6 : undefined,
  };
}

export async function basicFinancials(
  symbol: string,
): Promise<StockMetrics | null> {
  return parseFinnhubMetric(
    await fh("/stock/metric", { symbol, metric: "all" }, 12 * H),
  );
}

export interface Recommendation {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

/** Analysts' buy / hold / sell counts by month, newest first. */
export async function recommendations(
  symbol: string,
): Promise<Recommendation[]> {
  const r = await fh<Record<string, unknown>[]>(
    "/stock/recommendation",
    { symbol },
    12 * H,
  );
  return (Array.isArray(r) ? r : [])
    .map((x) => ({
      period: str(x.period) ?? "",
      strongBuy: n(x.strongBuy) ?? 0,
      buy: n(x.buy) ?? 0,
      hold: n(x.hold) ?? 0,
      sell: n(x.sell) ?? 0,
      strongSell: n(x.strongSell) ?? 0,
    }))
    .filter(
      (x) =>
        x.period && x.strongBuy + x.buy + x.hold + x.sell + x.strongSell > 0,
    )
    .sort((a, b) => b.period.localeCompare(a.period));
}

export interface EarningsResult {
  period: string;
  actual?: number;
  estimate?: number;
  surprisePct?: number;
}

/** Reported EPS against the consensus for the last few quarters, newest first. */
export async function earningsHistory(
  symbol: string,
): Promise<EarningsResult[]> {
  const r = await fh<Record<string, unknown>[]>(
    "/stock/earnings",
    { symbol },
    12 * H,
  );
  return (Array.isArray(r) ? r : [])
    .map((x) => ({
      period: str(x.period) ?? "",
      actual: n(x.actual),
      estimate: n(x.estimate),
      surprisePct: n(x.surprisePercent),
    }))
    .filter((x) => x.period && x.actual != null)
    .sort((a, b) => b.period.localeCompare(a.period))
    .slice(0, 8);
}

/** The next results date, if Finnhub has one in the next four months. */
export async function nextEarnings(
  symbol: string,
): Promise<{ date: string; hour?: string; epsEstimate?: number } | null> {
  const today = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
  const r = await fh<{ earningsCalendar?: Record<string, unknown>[] }>(
    "/calendar/earnings",
    { symbol, from: today, to },
    6 * H,
  );
  const e = (r?.earningsCalendar ?? [])
    .filter((x) => typeof x.date === "string")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  return e
    ? { date: String(e.date), hour: str(e.hour), epsEstimate: n(e.epsEstimate) }
    : null;
}

/** Companies Finnhub groups with this one (same country and sub-industry). */
export async function peers(symbol: string): Promise<string[]> {
  const r = await fh<string[]>("/stock/peers", { symbol }, 24 * H);
  return (Array.isArray(r) ? r : [])
    .filter((s) => typeof s === "string" && s !== symbol)
    .slice(0, 12);
}
