import type { NextRequest } from "next/server";
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

interface SearchHit {
  /** Our stock-page symbol. */
  symbol: string;
  name: string;
  ticker: string;
  market?: string;
  type?: string;
}

const UA = "Mozilla/5.0 (compatible; gilt-monitor)";
const TYPES = new Set(["EQUITY", "ETF"]);

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
          type: x.quoteType === "ETF" ? "ETF" : undefined,
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

/** GET /api/search?q=barclays → listings worldwide: our own list first, then Yahoo or Finnhub search. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 1) return Response.json({ results: [] });
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
  return Response.json({ results: results.slice(0, 15) });
}
