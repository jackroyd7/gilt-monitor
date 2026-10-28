// Suggestions for the "Chart any TradingView symbol…" search. Deliberately short: common
// instruments a UK rates investor is likely to want, with everyday aliases. Anything not
// here can still be typed as EXCHANGE:TICKER.

import { MARKET_GROUPS, type MarketSymbol } from "./markets";
import { STOCKS } from "./stock-catalogue";

export interface CatalogueEntry extends MarketSymbol {
  group: string;
  aliases?: string[];
}

const yields = (country: string, code: string, tenors: number[], aliases: (t: number) => string[] = () => []) =>
  tenors.map((t) => ({
    symbol: `TVC:${code}${String(t).padStart(2, "0")}Y`,
    name: `${country} ${t}y yield`,
    group: "Bond yields",
    aliases: aliases(t),
  }));

const EXTRAS: CatalogueEntry[] = [
  ...yields("UK", "GB", [2, 5, 10, 30], (t) => [`gilt ${t}`, `gilt ${t}y`, "gilts"]),
  ...yields("US", "US", [2, 5, 10, 30], (t) => [`treasury ${t}`, `ust ${t}`, "treasuries"]),
  ...yields("Germany", "DE", [2, 10, 30], (t) => [`bund ${t}`, "bunds", "schatz"]),
  ...yields("France", "FR", [10], () => ["oat", "oats"]),
  ...yields("Italy", "IT", [10], () => ["btp", "btps"]),
  ...yields("Spain", "ES", [10], () => ["bono", "spanish"]),
  ...yields("Japan", "JP", [10, 30], () => ["jgb", "jgbs"]),
  ...yields("Canada", "CA", [10]),
  ...yields("Australia", "AU", [10], () => ["acgb"]),
  { symbol: "FX:GBPNZD", name: "GBP/NZD", group: "FX spot" },
  { symbol: "FX:USDZAR", name: "USD/ZAR", group: "FX spot", aliases: ["rand"] },
  { symbol: "FX:EURAUD", name: "EUR/AUD", group: "FX spot" },
  { symbol: "FX:AUDJPY", name: "AUD/JPY", group: "FX spot" },
  { symbol: "CAPITALCOM:COCOA", name: "Cocoa", group: "Commodities" },
  { symbol: "BITSTAMP:BTCUSD", name: "Bitcoin", group: "Crypto", aliases: ["btc", "crypto"] },
  { symbol: "BITSTAMP:ETHUSD", name: "Ether", group: "Crypto", aliases: ["eth", "ethereum", "crypto"] },
];

const ALIASES: Record<string, string[]> = {
  "FOREXCOM:UKXGBP": ["footsie", "ftse", "uk 100", "ukx"],
  "FOREXCOM:SPXUSD": ["spx", "s&p", "sp500", "us 500"],
  "FOREXCOM:NSXUSD": ["ndx", "nasdaq", "tech"],
  "FOREXCOM:DJI": ["dow", "djia"],
  "FOREXCOM:GRXEUR": ["dax", "germany"],
  "FOREXCOM:FRXEUR": ["cac", "france"],
  "FOREXCOM:JP225": ["nikkei", "japan"],
  "FOREXCOM:HKXHKD": ["hang seng", "hsi", "hong kong"],
  "FOREXCOM:AUXAUD": ["asx", "australia"],
  "CAPITALCOM:VIX": ["volatility", "fear"],
  "FX:GBPUSD": ["cable", "sterling", "pound"],
  "FX_IDC:GBPEUR": ["sterling", "pound"],
  "FX:EURGBP": ["sterling", "pound"],
  "FX:EURUSD": ["fiber", "euro"],
  "FX:USDJPY": ["yen"],
  "FX:GBPJPY": ["yen"],
  "FX:USDCHF": ["swissie", "franc"],
  "FX:AUDUSD": ["aussie"],
  "FX:NZDUSD": ["kiwi"],
  "FX:USDCAD": ["loonie"],
  "FX:USDCNH": ["yuan", "renminbi", "china"],
  "TVC:DXY": ["dollar", "dxy", "usd index"],
  "TVC:UKOIL": ["oil", "brent", "crude"],
  "TVC:USOIL": ["oil", "wti", "crude"],
  "CAPITALCOM:NATURALGAS": ["gas", "nat gas", "natgas"],
  "TVC:GOLD": ["xau", "bullion"],
  "TVC:SILVER": ["xag"],
  "CAPITALCOM:COPPER": ["metals", "dr copper"],
};

/** Everything on the Markets lists plus the extras, each symbol once. */
export const SYMBOL_CATALOGUE: CatalogueEntry[] = (() => {
  const seen = new Set<string>();
  const out: CatalogueEntry[] = [];
  const push = (e: CatalogueEntry) => {
    if (seen.has(e.symbol)) return;
    seen.add(e.symbol);
    out.push({ ...e, aliases: [...(e.aliases ?? []), ...(ALIASES[e.symbol] ?? [])] });
  };
  for (const g of MARKET_GROUPS) for (const s of [...g.symbols, ...g.more]) push({ ...s, group: g.title });
  EXTRAS.forEach(push);
  STOCKS.forEach(push);
  return out;
})();
