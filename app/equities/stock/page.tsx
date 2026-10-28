import Link from "next/link";
import { connection } from "next/server";
import HeadlineList from "@/components/HeadlineList";
import {
  EarningsAnalystsCard,
  MetricsCard,
  PeersCard,
  ProfileCard,
  TradingCard,
} from "@/components/StockInsights";
import StockOwnView from "@/components/StockOwnView";
import StockView from "@/components/StockView";
import { PageHeader } from "@/components/Tiles";
import { STOCKS, US_ADRS } from "@/config/stock-catalogue";
import { SECTOR_OF } from "@/config/sectors";
import { loadStockQuotes } from "@/lib/data";
import { finnhubKey } from "@/lib/earnings-fetch";
import { finnhubSymbol } from "@/lib/earnings";
import {
  basicFinancials,
  companyProfile,
  earningsHistory,
  nextEarnings,
  peers as finnhubPeers,
  recommendations,
} from "@/lib/finnhub";
import { marketName, tidyName, usExchangeOf } from "@/lib/global-symbols";
import { getQueryNews } from "@/lib/news-fetch";
import { stockHistory, widgetsServe } from "@/lib/stock-history";
import { yahooSymbol } from "@/lib/stocks";
import { yahooError, yahooSummary } from "@/lib/yahoo-summary";
import { pageSymbol } from "@/lib/stock-lookup";
import { normaliseTvSymbol } from "@/lib/tv-symbol";

export const metadata = { title: "Stock · Markets Monitor" };

// TradingView symbols look like "LSE:SHEL" or "NYSE:BRK.B"; other markets are "YF:<Yahoo ticker>".
const VALID = /^[A-Z0-9_]+:[A-Z0-9._!-]+$/i;

export default async function StockPage({
  searchParams,
}: PageProps<"/equities/stock">) {
  await connection();
  const params = await searchParams;
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const asked =
    normaliseTvSymbol(first(params.tvwidgetsymbol), first(params.exchange)) ??
    "";
  if (!VALID.test(asked)) {
    return (
      <PageHeader title="Stock">
        No stock chosen. Search for one on the{" "}
        <Link href="/equities" className="text-accent underline">
          Equities
        </Link>{" "}
        tab.
      </PageHeader>
    );
  }
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
  const news = await getQueryNews(
    `"${name.replace(/\b(plc|inc\.?|ltd|ag|sa|se|nv|corp\.?|corporation|holdings?)\b/gi, "").trim() || ticker}" (shares OR stock OR results)`,
    "stock",
  );

  // Peers: Finnhub's list, or for stocks on our lists the same sector in the same market.
  const quoteOf = (s: string) => quotes?.quotes[s]?.change;
  let peerList = peerTickers.flatMap((t) => {
    const s = pageSymbol(t);
    if (!s) return [];
    return [
      {
        symbol: s,
        name: STOCKS.find((x) => x.symbol === s)?.name ?? t,
        change: quoteOf(s),
      },
    ];
  });
  if (!peerList.length && SECTOR_OF[symbol]) {
    peerList = STOCKS.filter(
      (s) => s.symbol !== symbol && SECTOR_OF[s.symbol] === SECTOR_OF[symbol],
    ).map((s) => ({
      symbol: s.symbol,
      name: s.name,
      change: quoteOf(s.symbol),
    }));
  }

  const insights = (
    <>
      <MetricsCard
        m={metrics}
        profile={profile}
        currency={capCurrency ?? profile?.currency ?? history?.currency}
        hasKey={!!finnhubKey()}
        source={metricsSource}
        missing={missing}
      />
      <EarningsAnalystsCard
        next={next}
        results={results}
        recs={recsAll}
        resultsNote={resultsNote}
        target={
          ys?.target ? { ...ys.target, currency: ys.currency } : undefined
        }
        price={history?.price}
      />
      <PeersCard peers={peerList.slice(0, 16)} />
    </>
  );
  const sub = [
    ticker,
    marketName(symbol),
    fullProfile?.industry ?? SECTOR_OF[symbol],
    fullProfile?.country,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <div className="mb-3 text-xs">
        <Link href="/equities" className="text-accent">
          ← Equities
        </Link>
      </div>
      <PageHeader title={name}>{sub}</PageHeader>
      <div className="grid gap-4 xl:grid-cols-4">
        <div className="min-w-0 space-y-4 xl:col-span-3">
          {own ? (
            <StockOwnView
              history={history}
              quote={quotes?.quotes[symbol]}
              tvUrl={
                /^(YF|US):/.test(symbol)
                  ? `https://www.tradingview.com/search/?query=${encodeURIComponent(ticker.split(".")[0])}`
                  : `https://www.tradingview.com/symbols/${symbol.replace(":", "-")}/`
              }
              metrics={insights}
              name={name}
            />
          ) : (
            <StockView
              symbol={symbol}
              metrics={
                <>
                  <TradingCard history={history} />
                  {insights}
                </>
              }
            />
          )}
        </div>
        <div className="space-y-4">
          <ProfileCard profile={fullProfile} name={name} />
          <section className="card h-fit p-4">
            <h2 className="mb-1 text-sm font-semibold text-ink">News</h2>
            <HeadlineList items={news.slice(0, 15)} />
          </section>
        </div>
      </div>
    </>
  );
}
