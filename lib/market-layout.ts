// Editable Markets layout: which benchmark cards each asset class shows, in what order.
// Pure functions so they can be tested; the board saves the result in localStorage.

import { MARKET_GROUPS, type MarketSymbol } from "@/config/markets";

export type MarketLayout = Record<string, MarketSymbol[]>;

export const defaultLayout = (): MarketLayout =>
  Object.fromEntries(MARKET_GROUPS.map((g) => [g.title, g.symbols.map((s) => ({ ...s }))]));

/** TradingView symbol names look like "EXCHANGE:TICKER" (futures may end in "1!"). */
export const isSymbol = (s: string) => /^[A-Z0-9_]{1,20}:[A-Z0-9_.!&-]{1,30}$/i.test(s.trim());

export function moveCard(list: MarketSymbol[], from: number, to: number): MarketSymbol[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [card] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, card);
  return next;
}

export function addCard(list: MarketSymbol[], card: MarketSymbol): MarketSymbol[] {
  const symbol = card.symbol.trim().toUpperCase();
  if (!isSymbol(symbol) || list.some((c) => c.symbol.toUpperCase() === symbol)) return list;
  return [...list, { symbol, name: card.name.trim().slice(0, 40) || symbol }];
}

export const removeCard = (list: MarketSymbol[], symbol: string) => list.filter((c) => c.symbol !== symbol);

/** Accepts a saved layout only if it is well-formed; unknown groups and bad entries are dropped. */
export function sanitizeLayout(saved: unknown): MarketLayout | null {
  if (!saved || typeof saved !== "object") return null;
  const out = defaultLayout();
  let any = false;
  for (const g of MARKET_GROUPS) {
    const list = (saved as Record<string, unknown>)[g.title];
    if (!Array.isArray(list)) continue;
    any = true;
    out[g.title] = list.reduce<MarketSymbol[]>(
      (acc, c) =>
        c && typeof c === "object" && typeof c.symbol === "string" && typeof c.name === "string" ? addCard(acc, c) : acc,
      [],
    );
  }
  return any ? out : null;
}
