import { STOCKS } from "@/config/stock-catalogue";
import { pageSymbolFor } from "./global-symbols";
import { yahooSymbol } from "./stocks";

/** Yahoo ticker → symbol, for the stocks on our own lists. */
export const CATALOGUE_BY_TICKER = new Map(
  STOCKS.flatMap((s) => {
    const y = yahooSymbol(s.symbol);
    return y ? [[y.toUpperCase(), s.symbol] as const] : [];
  }),
);

/** Our page symbol for a Yahoo / Finnhub ticker. */
export const pageSymbol = (ticker: string, usExchange?: string) =>
  pageSymbolFor(ticker, CATALOGUE_BY_TICKER, usExchange);
