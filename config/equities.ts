// Equities tab settings. TradingView's free widgets only serve US exchanges, so the other
// markets use our own heat grid and movers from daily quotes (data/stocks.json).

export interface EquityMarket {
  id: string;
  label: string;
  /** TradingView heatmap dataSource and movers exchange: only US markets work in the free widgets. */
  tv?: { heatmap: string; movers: string };
  /** Otherwise our own grid and movers from daily quotes for this stock-list group. */
  own?: { group: string; prefix?: string };
}

export const EQUITY_MARKETS: EquityMarket[] = [
  { id: "uk", label: "UK · FTSE 100", own: { group: "UK stocks" } },
  { id: "us", label: "US · S&P 500", tv: { heatmap: "SPX500", movers: "US" } },
  { id: "us-tech", label: "US · Nasdaq 100", tv: { heatmap: "NASDAQ100", movers: "NASDAQ" } },
  { id: "de", label: "Germany · DAX & large caps", own: { group: "German stocks" } },
  { id: "fr", label: "France · CAC 40 & large caps", own: { group: "French stocks" } },
  { id: "jp", label: "Japan · large caps", own: { group: "Asian stocks", prefix: "TSE:" } },
];

/** Heatmap colour: performance over this period ("change" is today). */
export const HEATMAP_PERIODS = [
  { id: "change", label: "1D" },
  { id: "Perf.W", label: "1W" },
  { id: "Perf.1M", label: "1M" },
  { id: "Perf.YTD", label: "YTD" },
  { id: "Perf.Y", label: "1Y" },
];

// Sector ETFs: SPDR for the US, iShares STOXX Europe 600 sector ETFs on Xetra for Europe.
export const SECTOR_GROUPS = [
  {
    name: "US sectors",
    symbols: [
      ["AMEX:XLK", "Technology"],
      ["AMEX:XLC", "Communication"],
      ["AMEX:XLY", "Consumer discretionary"],
      ["AMEX:XLP", "Consumer staples"],
      ["AMEX:XLF", "Financials"],
      ["AMEX:XLV", "Health care"],
      ["AMEX:XLI", "Industrials"],
      ["AMEX:XLE", "Energy"],
      ["AMEX:XLB", "Materials"],
      ["AMEX:XLU", "Utilities"],
      ["AMEX:XLRE", "Real estate"],
    ],
  },
  {
    name: "Europe sectors",
    symbols: [
      ["XETR:EXV1", "Banks"],
      ["XETR:EXH5", "Insurance"],
      ["XETR:EXH1", "Oil & gas"],
      ["XETR:EXV6", "Basic resources"],
      ["XETR:EXV3", "Technology"],
      ["XETR:EXV4", "Health care"],
      ["XETR:EXH4", "Industrials"],
      ["XETR:EXV5", "Autos"],
      ["XETR:EXH3", "Food & beverage"],
      ["XETR:EXV2", "Telecoms"],
      ["XETR:EXH9", "Utilities"],
    ],
  },
].map((g) => ({ name: g.name, symbols: g.symbols.map(([name, displayName]) => ({ name, displayName })) }));

// Volatility and style: a rising line means the first named leg is outperforming.
export const STYLE_CHARTS = [
  // TradingView's free charts don't carry the CBOE VIX or FTSE index feeds; CFD prices stand in.
  { symbol: "CAPITALCOM:VIX", title: "VIX", note: "S&P 500 implied volatility (CFD price)" },
  { symbol: "AMEX:IWD/AMEX:IWF", title: "Value vs growth (US)", note: "Russell 1000 Value ÷ Growth" },
  { symbol: "AMEX:IWM/AMEX:SPY", title: "Small vs large caps (US)", note: "Russell 2000 ÷ S&P 500" },
  { symbol: "AMEX:RSP/AMEX:SPY", title: "Equal vs cap weight (US)", note: "Breadth: average stock ÷ index" },
  { symbol: "FOREXCOM:UKXGBP/FOREXCOM:SPXUSD", title: "UK vs US", note: "FTSE 100 ÷ S&P 500, local currency" },
  { symbol: "FOREXCOM:EUSTX50/FOREXCOM:SPXUSD", title: "Europe vs US", note: "Euro Stoxx 50 ÷ S&P 500, local currency" },
];
