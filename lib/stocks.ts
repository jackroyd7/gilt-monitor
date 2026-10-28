// Daily stock quotes for markets TradingView's free widgets don't serve (LSE, Xetra,
// Euronext Paris, Tokyo): fetched by the data job from Yahoo Finance's public chart feed.

export interface StockQuote {
  price: number;
  prevClose: number;
  /** % change on the previous close. */
  change: number;
  /** Time of the price, ISO. */
  time: string;
  currency?: string;
}

export interface StockQuotes {
  updatedAt: string;
  quotes: Record<string, StockQuote>;
}

const SUFFIX: Record<string, string> = {
  LSE: ".L",
  XETR: ".DE",
  EURONEXT: ".PA",
  TSE: ".T",
  HKEX: ".HK",
  KRX: ".KS",
  TWSE: ".TW",
  SZSE: ".SZ",
};

/** Yahoo Finance symbol for a TradingView one: "LSE:BP." → "BP.L", "LSE:BT.A" → "BT-A.L", "HKEX:700" → "0700.HK". */
export function yahooSymbol(tv: string): string | null {
  const [ex, raw] = tv.split(":");
  if (!raw) return null;
  if (ex === "NASDAQ" || ex === "NYSE" || ex === "AMEX")
    return raw.replace(/\./g, "-");
  const suffix = SUFFIX[ex];
  if (!suffix) return null;
  const t = raw.replace(/\.$/, "").replace(/\./g, "-");
  return (ex === "HKEX" ? t.padStart(4, "0") : t) + suffix;
}

/** Yahoo v8 chart response (range=5d, interval=1d) → latest price and previous daily close. */
export function parseYahooChart(json: unknown): StockQuote | null {
  const r = (
    json as {
      chart?: {
        result?: {
          meta?: Record<string, unknown>;
          timestamp?: number[];
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
      };
    }
  ).chart?.result?.[0];
  if (!r) return null;
  const closes = (r.indicators?.quote?.[0]?.close ?? [])
    .map((c, i) => [r.timestamp?.[i], c] as const)
    .filter(([t, c]) => t != null && c != null) as [number, number][];
  const meta = r.meta ?? {};
  const price =
    typeof meta.regularMarketPrice === "number"
      ? meta.regularMarketPrice
      : closes.at(-1)?.[1];
  const priceTime =
    typeof meta.regularMarketTime === "number"
      ? meta.regularMarketTime
      : closes.at(-1)?.[0];
  if (price == null || priceTime == null || closes.length < 2) return null;
  // The previous close is the last daily bar from an earlier day than the price.
  const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
  const prev = [...closes]
    .reverse()
    .find(([t]) => day(t) < day(priceTime))?.[1];
  if (!prev) return null;
  // LSE prices are quoted in pence (GBp); the change is unaffected.
  return {
    price,
    prevClose: prev,
    change: (price / prev - 1) * 100,
    time: new Date(priceTime * 1000).toISOString(),
    currency: typeof meta.currency === "string" ? meta.currency : undefined,
  };
}

// Indices, commodities and crypto charted from Yahoo (e.g. to compare a stock against).
const YAHOO_OTHER: Record<string, string> = {
  "FOREXCOM:UKXGBP": "^FTSE",
  "FOREXCOM:SPXUSD": "^GSPC",
  "FOREXCOM:NSXUSD": "^NDX",
  "FOREXCOM:GRXEUR": "^GDAXI",
  "FOREXCOM:FRXEUR": "^FCHI",
  "FOREXCOM:ESXEUR": "^IBEX",
  "FOREXCOM:JP225": "^N225",
  "FOREXCOM:DJI": "^DJI",
  "FOREXCOM:HKXHKD": "^HSI",
  "FOREXCOM:AUXAUD": "^AXJO",
  "CAPITALCOM:VIX": "^VIX",
  "TVC:DXY": "DX-Y.NYB",
  "TVC:UKOIL": "BZ=F",
  "TVC:USOIL": "CL=F",
  "TVC:GOLD": "GC=F",
  "TVC:SILVER": "SI=F",
  "TVC:PLATINUM": "PL=F",
  "TVC:PALLADIUM": "PA=F",
  "CAPITALCOM:NATURALGAS": "NG=F",
  "CAPITALCOM:COPPER": "HG=F",
  "CAPITALCOM:ALUMINUM": "ALI=F",
  "CAPITALCOM:WHEAT": "ZW=F",
  "CAPITALCOM:CORN": "ZC=F",
  "CAPITALCOM:SOYBEANS": "ZS=F",
  "CAPITALCOM:COFFEEARABICA": "KC=F",
  "CAPITALCOM:SUGAR": "SB=F",
  "CAPITALCOM:COCOA": "CC=F",
  "BITSTAMP:BTCUSD": "BTC-USD",
  "BITSTAMP:ETHUSD": "ETH-USD",
};

/** Yahoo symbol for any instrument we can chart from Yahoo: stocks, the main indices, FX pairs, commodities. */
export function yahooFor(tv: string): string | null {
  const s = tv.toUpperCase();
  if (YAHOO_OTHER[s]) return YAHOO_OTHER[s];
  const fx = s.match(/^(FX|FX_IDC|OANDA|FOREXCOM):([A-Z]{6})$/);
  if (fx) return `${fx[2]}=X`;
  return yahooSymbol(s);
}
