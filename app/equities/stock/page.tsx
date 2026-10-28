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
import { STOCKS, US_LISTINGS } from "@/config/stock-catalogue";
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
  const adr = US_LISTINGS[symbol];

  const [history, quotes, direct, recs, results, next, peerTickers] =
    await Promise.all([
      stockHistory(symbol),
      loadStockQuotes(),
      basicFinancials(fsym),
      recommendations(fsym),
      earningsHistory(fsym),
      nextEarnings(fsym),
      finnhubPeers(fsym),
    ]);
  // Asian names on Finnhub's free plan are often covered only through their US listing.
  const metrics = direct ?? (adr ? await basicFinancials(adr) : null);
  const recsAll = recs.length || !adr ? recs : await recommendations(adr);
  const name =
    entry?.name ?? tidyName(profile?.name ?? history?.name ?? ticker);
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
        currency={history?.currency}
        hasKey={!!finnhubKey()}
      />
      <EarningsAnalystsCard next={next} results={results} recs={recsAll} />
      <PeersCard peers={peerList.slice(0, 16)} />
    </>
  );
  const sub = [
    ticker,
    marketName(symbol),
    profile?.industry ?? SECTOR_OF[symbol],
    profile?.country,
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
          <ProfileCard profile={profile} name={name} />
          <section className="card h-fit p-4">
            <h2 className="mb-1 text-sm font-semibold text-ink">News</h2>
            <HeadlineList items={news.slice(0, 15)} />
          </section>
        </div>
      </div>
    </>
  );
}
