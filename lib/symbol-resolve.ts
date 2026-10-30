import "server-only";
import { STOCKS } from "@/config/stock-catalogue";
import { searchFinnhub } from "@/lib/finnhub";
import {
  MARKET_OF_SUFFIX,
  marketName,
  tidyName,
  usExchangeOf,
} from "@/lib/global-symbols";
import { pageSymbol } from "@/lib/stock-lookup";
import { searchSymbols } from "@/lib/symbol-search";

export interface SearchHit {
  /** Our stock-page symbol. */
  symbol: string;
  name: string;
  ticker: string;
  market?: string;
  type?: string;
}

// Listing search shared by the Equities search box and the tips reader.
const UA = "Mozilla/5.0 (compatible; gilt-monitor)";
// Shares, ETFs and funds (Yahoo lists UK unit trusts and OEICs as MUTUALFUND).
const TYPES = new Set(["EQUITY", "ETF", "MUTUALFUND"]);

async function yahooSearch(q: string): Promise<SearchHit[] | null> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`,
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) return null;
    const quotes =
      ((await res.json()) as { quotes?: Record<string, unknown>[] }).quotes ??
      [];
    return quotes.flatMap((x) => {
      const ticker = typeof x.symbol === "string" ? x.symbol : "";
      if (!ticker || !TYPES.has(String(x.quoteType))) return [];
      const symbol = pageSymbol(ticker, usExchangeOf(String(x.exchange ?? "")));
      if (!symbol) return [];
      const name = tidyName(String(x.longname ?? x.shortname ?? ticker));
      return [
        {
          symbol,
          name,
          ticker,
          market:
            typeof x.exchDisp === "string" ? x.exchDisp : marketName(symbol),
          type: x.quoteType === "ETF" ? "ETF" : x.quoteType === "MUTUALFUND" ? "Fund" : undefined,
        },
      ];
    });
  } catch {
    return null;
  }
}

async function finnhubSearch(q: string): Promise<SearchHit[] | null> {
  const hits = await searchFinnhub(q);
  if (!hits) return null;
  return hits.flatMap((h) => {
    if (/crypto|forex/i.test(h.type)) return [];
    const symbol = pageSymbol(h.symbol);
    if (!symbol) return [];
    const suffix = h.symbol.includes(".") ? h.symbol.split(".").pop()! : "";
    return [
      {
        symbol,
        name: tidyName(h.description),
        ticker: h.symbol,
        market: MARKET_OF_SUFFIX[suffix] ?? marketName(symbol),
        type: /etp|etf/i.test(h.type) ? "ETF" : undefined,
      },
    ];
  });
}

/** Listings worldwide for a name or ticker: our own list first, then Yahoo or Finnhub search. */
export async function searchListings(q: string): Promise<SearchHit[]> {
  const local: SearchHit[] = searchSymbols(q, STOCKS, 6).map((s) => ({
    symbol: s.symbol,
    name: s.name,
    ticker: s.symbol.split(":")[1] ?? s.symbol,
    market: marketName(s.symbol),
  }));
  const remote = (await yahooSearch(q)) ?? (await finnhubSearch(q)) ?? [];
  const seen = new Set(local.map((r) => r.symbol));
  const results = [...local];
  for (const r of remote) {
    if (seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    results.push(r);
  }
  return results.slice(0, 15);
}
