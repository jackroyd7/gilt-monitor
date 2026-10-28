// Editable Markets layout: which benchmark cards each asset class shows, in what order.
// Pure functions so they can be tested; the board saves the result in localStorage.

import { MARKET_GROUPS, type MarketSymbol } from "@/config/markets";

export type MarketLayout = Record<string, MarketSymbol[]>;

/**
 * Default cards added after layouts could be saved. A saved layout older than `version`
 * gets the card inserted where it sits in the defaults; once saved at the newer version,
 * removing the card sticks. Bump LAYOUT_VERSION when adding an entry.
 */
export const LAYOUT_VERSION = 2;
const ADDED_DEFAULTS: { version: number; group: string; symbol: string }[] = [
  { version: 2, group: "FX spot", symbol: "FX_IDC:GBPEUR" },
];

function upgrade(layout: MarketLayout, fromVersion: number): MarketLayout {
  const out = { ...layout };
  for (const a of ADDED_DEFAULTS) {
    if (a.version <= fromVersion) continue;
    const g = MARKET_GROUPS.find((x) => x.title === a.group);
    const card = g?.symbols.find((s) => s.symbol === a.symbol);
    const list = out[a.group];
    if (!g || !card || !list || list.some((c) => c.symbol === a.symbol)) continue;
    // Insert after the card that precedes it in the defaults, if that card is present.
    const before = g.symbols[g.symbols.findIndex((s) => s.symbol === a.symbol) - 1];
    const at = before ? list.findIndex((c) => c.symbol === before.symbol) + 1 : 0;
    out[a.group] = [...list.slice(0, at), { ...card }, ...list.slice(at)];
  }
  return out;
}

/** Cards whose feeds TradingView's free widgets don't serve; dropped from saved layouts. */
const UNAVAILABLE = new Set(["FTSE:MCX", "FOREXCOM:EUSTX50", "TVC:VIX"]);

/** What gets stored: the layout plus the version it was saved at. */
export const layoutForStorage = (layout: MarketLayout) => ({ ...layout, _v: LAYOUT_VERSION });

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
        c && typeof c === "object" && typeof c.symbol === "string" && typeof c.name === "string" && !UNAVAILABLE.has(c.symbol.toUpperCase())
          ? addCard(acc, c)
          : acc,
      [],
    );
  }
  if (!any) return null;
  const v = (saved as { _v?: unknown })._v;
  return upgrade(out, typeof v === "number" ? v : 1);
}
