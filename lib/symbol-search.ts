// Type-ahead over the short symbol catalogue. Pure, so it can be tested.

import type { CatalogueEntry } from "@/config/symbol-catalogue";
import { isSymbol } from "./market-layout";

const CURRENCIES = new Set([
  "GBP", "USD", "EUR", "JPY", "CHF", "AUD", "NZD", "CAD", "CNH", "CNY", "HKD", "SGD", "SEK", "NOK", "DKK",
  "PLN", "CZK", "HUF", "ZAR", "MXN", "TRY", "INR", "BRL", "KRW",
]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim();

/**
 * Up to `limit` suggestions for the query. Ranks exact and prefix matches on the name,
 * aliases and ticker above matches in the middle of a word. A six-letter currency pair
 * that isn't in the catalogue is offered via TradingView's FX_IDC feed, and a typed
 * EXCHANGE:TICKER is offered as-is.
 */
export function searchSymbols(query: string, catalogue: CatalogueEntry[], limit = 8): CatalogueEntry[] {
  const q = norm(query);
  if (!q) return [];
  const words = q.split(" ");
  const scored: { e: CatalogueEntry; score: number }[] = [];
  for (const e of catalogue) {
    const ticker = norm(e.symbol.split(":")[1] ?? e.symbol);
    const fields = [norm(e.name), ticker, ...(e.aliases ?? []).map(norm)];
    let score = 0;
    for (const f of fields) {
      if (f === q) score = Math.max(score, 100);
      else if (f.startsWith(q)) score = Math.max(score, 80);
      else if (f.split(" ").some((w) => w.startsWith(q))) score = Math.max(score, 60);
      else if (words.every((w) => f.includes(w))) score = Math.max(score, 40);
    }
    if (score) scored.push({ e, score });
  }
  // Stable sort: equal scores keep catalogue order (benchmarks before stocks, Brent before WTI).
  const results = scored.sort((a, b) => b.score - a.score).map((s) => s.e);

  const compact = q.replace(/[^a-z]/g, "").toUpperCase();
  if (compact.length === 6 && CURRENCIES.has(compact.slice(0, 3)) && CURRENCIES.has(compact.slice(3)) && compact.slice(0, 3) !== compact.slice(3)) {
    if (!results.some((r) => norm(r.symbol.split(":")[1] ?? "") === compact.toLowerCase())) {
      results.unshift({ symbol: `FX_IDC:${compact}`, name: `${compact.slice(0, 3)}/${compact.slice(3)}`, group: "FX spot" });
    }
  }
  if (isSymbol(query) && !results.some((r) => r.symbol === query.trim().toUpperCase())) {
    const sym = query.trim().toUpperCase();
    results.unshift({ symbol: sym, name: sym.split(":")[1], group: "Typed symbol" });
  }
  return results.slice(0, limit);
}
