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

// Benchmarks for each asset class on the Markets tab; clicking one opens its chart popup.
export const MARKET_GROUPS: { title: string; symbols: MarketSymbol[] }[] = [
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
  },
  {
    title: "FX spot",
    symbols: [
      { symbol: "FX:GBPUSD", name: "GBP/USD" },
      { symbol: "FX:EURGBP", name: "EUR/GBP" },
      { symbol: "FX:GBPJPY", name: "GBP/JPY" },
      { symbol: "FX:EURUSD", name: "EUR/USD" },
      { symbol: "FX:USDJPY", name: "USD/JPY" },
      { symbol: "TVC:DXY", name: "US dollar index" },
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
  },
];

/** Friendly name for a symbol, if it's one of ours. */
export const symbolName = (symbol: string) =>
  [...MARKET_GROUPS.flatMap((g) => g.symbols), ...TICKER_TAPE].find((s) => s.symbol === symbol)?.name;

/** Fallback symbol for the chart popup. */
export const DEFAULT_CHART_SYMBOL = "FX:GBPUSD";
