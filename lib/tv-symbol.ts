// TradingView widgets link back with ?tvwidgetsymbol=... in a few shapes:
//   "FX:GBPUSD"                 (most widgets)
//   "USDCHF?exchange=FX_IDC"    (the FX cross-rate grid: the exchange glued on as a second "?")
//   "USDCHF" plus &exchange=FX_IDC as its own parameter
//   "GBPEUR"                    (bare FX pair)
// This turns any of them into "EXCHANGE:TICKER".
export function normaliseTvSymbol(raw: string | undefined, exchangeParam?: string): string | undefined {
  let s = raw?.trim();
  if (!s) return undefined;
  let exchange = exchangeParam?.trim();
  const glued = s.match(/^([^?]+)\?exchange=([A-Za-z0-9_]+)/i);
  if (glued) [, s, exchange] = glued;
  if (!s.includes(":") && exchange) s = `${exchange.toUpperCase()}:${s}`;
  if (/^[A-Z]{6}$/i.test(s)) s = `FX_IDC:${s}`;
  return s.toUpperCase();
}
