import "server-only";
import { STOCKS, US_ADRS } from "@/config/stock-catalogue";
import { loadStockQuotes } from "./data";
import { finnhubSymbol } from "./earnings";
import {
  basicFinancials,
  companyProfile,
  earningsHistory,
  nextEarnings,
  peers as finnhubPeers,
  recommendations,
} from "./finnhub";
import { tidyName, usExchangeOf } from "./global-symbols";
import { stockHistory, widgetsServe } from "./stock-history";
import { yahooSymbol } from "./stocks";
import { yahooError, yahooSummary } from "./yahoo-summary";

/**
 * Everything we can find about one listing: prices from Yahoo's chart feed, and valuation,
 * analysts and results from Finnhub (US listings), Yahoo's quote summary, or Finnhub's
 * figures for the company's US-traded shares, in that order. Used by the stock page and
 * the tips portfolio.
 */
export async function companyData(asked: string) {
  const fsym = finnhubSymbol(asked) ?? asked.split(":")[1];
  const profile = await companyProfile(fsym);
  // A US listing found by search: resolve NASDAQ / NYSE so TradingView's widgets can show it.
  const symbol =
    asked.startsWith("US:") && usExchangeOf(profile?.exchange)
      ? `${usExchangeOf(profile?.exchange)}:${asked.slice(3)}`
      : asked;
  const entry = STOCKS.find((s) => s.symbol === symbol);
  const ticker = symbol.split(":")[1].replace(/\.$/, "");
  const own = !widgetsServe(symbol);
  const adr = US_ADRS[symbol];
  const ysym = own ? yahooSymbol(symbol) : null;

  const [history, quotes, direct, recs0, results0, next0, peerTickers, ys] =
    await Promise.all([
      stockHistory(symbol),
      loadStockQuotes(),
      basicFinancials(fsym),
      recommendations(fsym),
      earningsHistory(fsym),
      nextEarnings(fsym),
      finnhubPeers(fsym),
      ysym ? yahooSummary(ysym) : Promise.resolve(null),
    ]);
  // Finnhub's free plan covers US listings only. For other markets use Yahoo's figures,
  // or else Finnhub's for the company's US-traded shares (ratios are the same).
  let metrics = direct;
  let metricsSource = "Finnhub";
  let capCurrency: string | undefined;
  if (!metrics && ys?.metrics) {
    metrics = ys.metrics;
    metricsSource = "Yahoo Finance";
    capCurrency =
      ys.currency === "GBp" || ys.currency === "GBX" ? "GBP" : ys.currency;
  }
  const useAdr =
    !!adr && (!metrics || !recs0.length || !results0.length || !next0);
  const [adrMetrics, adrRecs, adrResults, adrNext, adrProfile] = useAdr
    ? await Promise.all([
        metrics ? Promise.resolve(null) : basicFinancials(adr),
        recommendations(adr),
        earningsHistory(adr),
        nextEarnings(adr),
        profile ? Promise.resolve(null) : companyProfile(adr),
      ])
    : [null, [], [], null, null];
  if (!metrics && adrMetrics) {
    metrics = adrMetrics;
    metricsSource = `Finnhub, via the US-traded shares (${adr}); amounts in US dollars`;
    capCurrency = "USD";
  }
  const recsAll = recs0.length ? recs0 : ys?.recs.length ? ys.recs : adrRecs;
  const yahooResults = ys?.results.length ? ys.results : null;
  const results = results0.length ? results0 : (yahooResults ?? adrResults);
  const resultsNote =
    !results0.length && !yahooResults && adrResults.length
      ? `EPS per US-traded share (${adr}), in US dollars`
      : undefined;
  // The US shares' EPS estimate is per US share, so only take the date from them.
  const next =
    next0 ??
    ys?.next ??
    (adrNext ? { date: adrNext.date, hour: adrNext.hour } : null);
  const missing = !metrics
    ? [
        "Finnhub's free plan doesn't cover this listing",
        ysym ? (yahooError() ?? "Yahoo had no figures") : undefined,
        adr ? undefined : "no US-traded shares on our list",
      ]
        .filter(Boolean)
        .join("; ")
    : undefined;
  // Company details: Finnhub's profile, else the US-traded shares' (minus listing details), plus Yahoo's.
  const baseProfile =
    profile ??
    (adrProfile
      ? {
          ...adrProfile,
          exchange: undefined,
          marketCap: undefined,
          shares: undefined,
          currency: undefined,
          ipo: undefined,
        }
      : null);
  const fullProfile =
    baseProfile || ys
      ? {
          ...baseProfile,
          name: baseProfile?.name ?? ys?.profile.name,
          industry: baseProfile?.industry ?? ys?.profile.industry,
          sector: ys?.profile.sector,
          country: baseProfile?.country ?? ys?.profile.country,
          web: baseProfile?.web ?? ys?.profile.web,
          employees: ys?.profile.employees,
          summary: ys?.profile.summary,
        }
      : null;
  const name =
    entry?.name ??
    tidyName(profile?.name ?? ys?.profile.name ?? history?.name ?? ticker);
  return {
    symbol,
    entry,
    ticker,
    own,
    name,
    history,
    quotes,
    profile,
    fullProfile,
    metrics,
    metricsSource,
    capCurrency,
    missing,
    recs: recsAll,
    results,
    resultsNote,
    next,
    peerTickers,
    ys,
  };
}

export type CompanyData = Awaited<ReturnType<typeof companyData>>;
