// Symbols shown on the Markets tab (TradingView's free embeddable widgets).
// Use TradingView symbol names, "EXCHANGE:TICKER". Some exchange feeds (e.g. LSE indices)
// aren't licensed for widgets, so equity indices use CFD feeds such as FOREXCOM. If a
// symbol shows blank, search for it on tradingview.com and copy the name it shows.

export interface MarketSymbol {
  symbol: string;
  name: string;
}

export const TICKER_TAPE: MarketSymbol[] = [
  { symbol: "TVC:GB10Y", name: "UK 10y" },
  { symbol: "TVC:US10Y", name: "US 10y" },
  { symbol: "TVC:DE10Y", name: "DE 10y" },
  { symbol: "FX:GBPUSD", name: "GBP/USD" },
  { symbol: "FX:EURGBP", name: "EUR/GBP" },
  { symbol: "FOREXCOM:UKXGBP", name: "FTSE 100" },
  { symbol: "FOREXCOM:SPXUSD", name: "S&P 500" },
  { symbol: "TVC:UKOIL", name: "Brent" },
  { symbol: "TVC:GOLD", name: "Gold" },
];

// Benchmarks for each asset class on the Markets tab (one card each); clicking one opens
// its chart popup. "more" fills the asset class's "More…" dropdown.
export const MARKET_GROUPS: { title: string; symbols: MarketSymbol[]; more: MarketSymbol[] }[] = [
  {
    title: "Equity indices",
    symbols: [
      { symbol: "FOREXCOM:UKXGBP", name: "FTSE 100" },
      { symbol: "FTSE:MCX", name: "FTSE 250" },
      { symbol: "FOREXCOM:SPXUSD", name: "S&P 500" },
      { symbol: "FOREXCOM:NSXUSD", name: "Nasdaq 100" },
      { symbol: "FOREXCOM:EUSTX50", name: "Euro Stoxx 50" },
      { symbol: "FOREXCOM:GRXEUR", name: "DAX" },
      { symbol: "FOREXCOM:JP225", name: "Nikkei 225" },
    ],
    more: [
      { symbol: "FOREXCOM:DJI", name: "Dow Jones" },
      { symbol: "FOREXCOM:FRXEUR", name: "CAC 40" },
      { symbol: "FOREXCOM:ESXEUR", name: "IBEX 35" },
      { symbol: "FOREXCOM:HKXHKD", name: "Hang Seng" },
      { symbol: "FOREXCOM:AUXAUD", name: "ASX 200" },
      { symbol: "CAPITALCOM:VIX", name: "VIX (US volatility)" },
    ],
  },
  {
    title: "FX spot",
    symbols: [
      { symbol: "FX:GBPUSD", name: "GBP/USD" },
      { symbol: "FX_IDC:GBPEUR", name: "GBP/EUR" },
      { symbol: "FX:EURGBP", name: "EUR/GBP" },
      { symbol: "FX:GBPJPY", name: "GBP/JPY" },
      { symbol: "FX:EURUSD", name: "EUR/USD" },
      { symbol: "FX:USDJPY", name: "USD/JPY" },
      { symbol: "TVC:DXY", name: "US dollar index" },
    ],
    more: [
      { symbol: "FX:GBPCHF", name: "GBP/CHF" },
      { symbol: "FX:GBPAUD", name: "GBP/AUD" },
      { symbol: "FX:GBPCAD", name: "GBP/CAD" },
      { symbol: "FX:AUDUSD", name: "AUD/USD" },
      { symbol: "FX:USDCHF", name: "USD/CHF" },
      { symbol: "FX:USDCAD", name: "USD/CAD" },
      { symbol: "FX:NZDUSD", name: "NZD/USD" },
      { symbol: "FX:EURJPY", name: "EUR/JPY" },
      { symbol: "FX:EURCHF", name: "EUR/CHF" },
      { symbol: "FX:USDCNH", name: "USD/CNH" },
      { symbol: "FX:USDMXN", name: "USD/MXN" },
    ],
  },
  {
    title: "Commodities",
    symbols: [
      { symbol: "TVC:UKOIL", name: "Brent crude" },
      { symbol: "TVC:USOIL", name: "WTI crude" },
      { symbol: "CAPITALCOM:NATURALGAS", name: "Natural gas" },
      { symbol: "TVC:GOLD", name: "Gold" },
      { symbol: "TVC:SILVER", name: "Silver" },
      { symbol: "CAPITALCOM:COPPER", name: "Copper" },
    ],
    more: [
      { symbol: "TVC:PLATINUM", name: "Platinum" },
      { symbol: "TVC:PALLADIUM", name: "Palladium" },
      { symbol: "CAPITALCOM:ALUMINUM", name: "Aluminium" },
      { symbol: "CAPITALCOM:WHEAT", name: "Wheat" },
      { symbol: "CAPITALCOM:CORN", name: "Corn" },
      { symbol: "CAPITALCOM:SOYBEANS", name: "Soybeans" },
      { symbol: "CAPITALCOM:COFFEEARABICA", name: "Coffee" },
      { symbol: "CAPITALCOM:SUGAR", name: "Sugar" },
    ],
  },
];

/** Friendly name for a symbol, if it's one of ours. */
export const symbolName = (symbol: string) =>
  [...MARKET_GROUPS.flatMap((g) => [...g.symbols, ...g.more]), ...TICKER_TAPE].find((s) => s.symbol === symbol)?.name;

/** Fallback symbol for the chart popup. */
export const DEFAULT_CHART_SYMBOL = "FX:GBPUSD";
