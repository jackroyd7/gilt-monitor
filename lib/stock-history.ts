import "server-only";
import { yahooFor } from "./stocks";

// Daily price history (five years) for one stock, index, currency or commodity from Yahoo Finance's public chart feed, for stocks whose
// exchange TradingView's free widgets don't serve. Cached per symbol for 15 minutes.

export interface StockHistory {
  symbol: string;
  currency?: string;
  exchange?: string;
  price: number;
  time: string;
  points: [string, number][];
  high52?: number;
  low52?: number;
}

const CACHE_MS = 15 * 60_000;
const store = ((
  globalThis as {
    __giltStockHist?: Map<string, { at: number; h: StockHistory }>;
  }
).__giltStockHist ??= new Map());

/** US exchanges work in TradingView's widgets; everything else gets our own view. */
export const widgetsServe = (tv: string) => /^(NASDAQ|NYSE|AMEX):/i.test(tv);

export async function stockHistory(tv: string): Promise<StockHistory | null> {
  const hit = store.get(tv);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.h;
  const y = yahooFor(tv);
  if (!y) return null;
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?range=5y&interval=1d`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; gilt-monitor)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) throw new Error(String(res.status));
    const r = (
      (await res.json()) as {
        chart?: {
          result?: {
            meta?: Record<string, unknown>;
            timestamp?: number[];
            indicators?: { quote?: { close?: (number | null)[] }[] };
          }[];
        };
      }
    ).chart?.result?.[0];
    const ts = r?.timestamp ?? [];
    const closes = r?.indicators?.quote?.[0]?.close ?? [];
    const points = ts.flatMap((t, i) =>
      closes[i] == null
        ? []
        : [
            [
              new Date(t * 1000).toISOString().slice(0, 10),
              +closes[i]!.toFixed(4),
            ] as [string, number],
          ],
    );
    const meta = r?.meta ?? {};
    const price =
      typeof meta.regularMarketPrice === "number"
        ? meta.regularMarketPrice
        : points.at(-1)?.[1];
    if (!points.length || price == null) return hit?.h ?? null;
    const t =
      typeof meta.regularMarketTime === "number"
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : new Date().toISOString();
    const h: StockHistory = {
      symbol: tv,
      currency: typeof meta.currency === "string" ? meta.currency : undefined,
      exchange:
        typeof meta.fullExchangeName === "string"
          ? meta.fullExchangeName
          : undefined,
      price,
      time: t,
      points,
      high52:
        typeof meta.fiftyTwoWeekHigh === "number"
          ? meta.fiftyTwoWeekHigh
          : undefined,
      low52:
        typeof meta.fiftyTwoWeekLow === "number"
          ? meta.fiftyTwoWeekLow
          : undefined,
    };
    if (store.size > 300) store.clear();
    store.set(tv, { at: Date.now(), h });
    return h;
  } catch {
    return hit?.h ?? null;
  }
}
