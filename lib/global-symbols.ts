// Mapping between Yahoo / Finnhub tickers ("BARC.L", "ASML.AS", "AAPL") and the symbols our
// stock pages use. Markets in our own lists keep TradingView's names ("LSE:BARC"); US
// listings use NASDAQ/NYSE/AMEX (or "US:" until the exchange is known); any other market
// is "YF:<Yahoo ticker>". Pure, so it can be tested.

/** Yahoo suffix → TradingView exchange, for markets on our own lists. */
const OWN: Record<string, string> = {
  L: "LSE",
  DE: "XETR",
  PA: "EURONEXT",
  T: "TSE",
  HK: "HKEX",
  KS: "KRX",
  TW: "TWSE",
  SZ: "SZSE",
};

/** Yahoo suffixes for listings outside the US, with a readable market name. */
export const MARKET_OF_SUFFIX: Record<string, string> = {
  L: "London",
  DE: "Xetra",
  F: "Frankfurt",
  PA: "Paris",
  AS: "Amsterdam",
  BR: "Brussels",
  LS: "Lisbon",
  MI: "Milan",
  MC: "Madrid",
  SW: "Swiss",
  VI: "Vienna",
  IR: "Dublin",
  HE: "Helsinki",
  ST: "Stockholm",
  CO: "Copenhagen",
  OL: "Oslo",
  IC: "Iceland",
  WA: "Warsaw",
  PR: "Prague",
  AT: "Athens",
  IS: "Istanbul",
  TO: "Toronto",
  V: "TSX Venture",
  NE: "Cboe Canada",
  AX: "ASX",
  NZ: "New Zealand",
  SI: "Singapore",
  KL: "Kuala Lumpur",
  BK: "Bangkok",
  JK: "Jakarta",
  NS: "NSE India",
  BO: "BSE India",
  SS: "Shanghai",
  SZ: "Shenzhen",
  HK: "Hong Kong",
  T: "Tokyo",
  KS: "Korea",
  KQ: "KOSDAQ",
  TW: "Taiwan",
  TWO: "Taipei Exchange",
  SA: "São Paulo",
  MX: "Mexico",
  BA: "Buenos Aires",
  SN: "Santiago",
  JO: "Johannesburg",
  TA: "Tel Aviv",
  SR: "Saudi",
  QA: "Qatar",
};

/** Our page symbol for a Yahoo / Finnhub ticker. `catalogue` maps Yahoo tickers of stocks on our lists to their symbols. */
export function pageSymbolFor(
  ticker: string,
  catalogue: Map<string, string>,
  usExchange?: string,
): string | null {
  const up = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.\-]*$/.test(up)) return null;
  const known = catalogue.get(up);
  if (known) return known;
  const m = up.match(/^(.+)\.([A-Z]{1,3})$/);
  if (m && MARKET_OF_SUFFIX[m[2]]) {
    const ex = OWN[m[2]];
    if (!ex) return `YF:${up}`;
    let base = m[1].replace(/-/g, ".");
    if (ex === "HKEX" && /^\d+$/.test(base)) base = String(Number(base));
    return `${ex}:${base}`;
  }
  // No market suffix: a US listing ("BRK.B" is a share class, not a market).
  return `${usExchange ?? "US"}:${up}`;
}

/** NASDAQ / NYSE / AMEX from Finnhub's exchange name or Yahoo's exchange code. */
export function usExchangeOf(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const s = name.toUpperCase();
  if (/^(NMS|NGM|NCM|NAS)$/.test(s) || s.includes("NASDAQ")) return "NASDAQ";
  if (/^(ASE|PCX|BTS)$/.test(s) || s.includes("ARCA") || s.includes("AMERICAN"))
    return "AMEX";
  if (s === "NYQ" || s.includes("NEW YORK STOCK EXCHANGE") || s === "NYSE")
    return "NYSE";
  return undefined;
}

/** Readable market name for a page symbol. */
export function marketName(symbol: string): string | undefined {
  const [ex, raw = ""] = symbol.split(":");
  if (ex === "YF") return MARKET_OF_SUFFIX[raw.split(".").pop() ?? ""];
  return {
    LSE: "London",
    XETR: "Xetra",
    EURONEXT: "Paris",
    TSE: "Tokyo",
    HKEX: "Hong Kong",
    KRX: "Korea",
    TWSE: "Taiwan",
    SZSE: "Shenzhen",
    NASDAQ: "Nasdaq",
    NYSE: "NYSE",
    AMEX: "NYSE American",
    US: "US",
  }[ex];
}

const KEEP_UPPER = new Set([
  "PLC",
  "ADR",
  "ADS",
  "NV",
  "AG",
  "SA",
  "SE",
  "SPA",
  "AB",
  "ASA",
  "AS",
  "ETF",
  "UK",
  "US",
  "USA",
  "REIT",
  "LP",
  "LLC",
  "II",
  "III",
  "IV",
  "BHP",
  "HSBC",
  "BP",
  "IBM",
  "AMD",
  "TSMC",
  "ASML",
  "SAP",
  "BMW",
  "UCITS",
]);

/** "LLOYDS BANKING GROUP PLC" → "Lloyds Banking Group PLC"; names in mixed case are left alone. */
export function tidyName(name: string): string {
  if (name !== name.toUpperCase() || !/[A-Z]{3}/.test(name)) return name;
  return name
    .toLowerCase()
    .replace(/[a-z0-9&'.]+/g, (w) =>
      KEEP_UPPER.has(w.toUpperCase().replace(/\./g, ""))
        ? w.toUpperCase()
        : w[0].toUpperCase() + w.slice(1),
    );
}
