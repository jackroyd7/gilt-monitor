import Link from "next/link";
import { connection } from "next/server";
import HeadlineList from "@/components/HeadlineList";
import StockOwnView from "@/components/StockOwnView";
import StockView from "@/components/StockView";
import { PageHeader } from "@/components/Tiles";
import { STOCKS } from "@/config/stock-catalogue";
import { getQueryNews } from "@/lib/news-fetch";
import { loadStockMetrics, loadStockQuotes } from "@/lib/data";
import StockMetricsPanel from "@/components/StockMetrics";
import { stockHistory, widgetsServe } from "@/lib/stock-history";
import { normaliseTvSymbol } from "@/lib/tv-symbol";

export const metadata = { title: "Stock · Markets Monitor" };

const PEER_LABEL: Record<string, string> = {
  "UK stocks": "UK median",
  "US stocks": "US median",
  "German stocks": "DE median",
  "French stocks": "FR median",
  "Asian stocks": "Asia median",
};

// TradingView symbols look like "LSE:SHEL" or "NYSE:BRK.B".
const VALID = /^[A-Z0-9_]+:[A-Z0-9._!-]+$/i;

export default async function StockPage({
  searchParams,
}: PageProps<"/equities/stock">) {
  await connection();
  const params = await searchParams;
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const symbol =
    normaliseTvSymbol(first(params.tvwidgetsymbol), first(params.exchange)) ??
    "";
  if (!VALID.test(symbol)) {
    return (
      <PageHeader title="Stock">
        No stock chosen. Pick one from the{" "}
        <Link href="/equities" className="text-accent underline">
          Equities
        </Link>{" "}
        tab.
      </PageHeader>
    );
  }
  const entry = STOCKS.find((s) => s.symbol === symbol);
  const name = entry?.name;
  const ticker = symbol.split(":")[1].replace(/\.$/, "");
  const own = !widgetsServe(symbol);
  const [news, history, quotes, metrics] = await Promise.all([
    getQueryNews(
      name ? `"${name}" (shares OR stock OR results)` : `${ticker} stock`,
      "stock",
    ),
    own ? stockHistory(symbol) : Promise.resolve(null),
    own ? loadStockQuotes() : Promise.resolve(undefined),
    loadStockMetrics(),
  ]);
  // Compare with the median of the same market's stocks on our list.
  const peers = entry
    ? STOCKS.filter((s) => s.group === entry.group).flatMap(
        (s) => metrics?.stocks[s.symbol] ?? [],
      )
    : [];
  const metricsPanel = (
    <StockMetricsPanel
      m={metrics?.stocks[symbol]}
      peers={peers}
      peerLabel={PEER_LABEL[entry?.group ?? ""] ?? "Median"}
    />
  );
  return (
    <>
      <div className="mb-3 text-xs">
        <Link href="/equities" className="text-accent">
          ← Equities
        </Link>
      </div>
      <PageHeader title={name ?? ticker}>{symbol}</PageHeader>
      <div className="grid gap-4 xl:grid-cols-4">
        <div className="xl:col-span-3">
          {own ? (
            <StockOwnView
              history={history}
              quote={quotes?.quotes[symbol]}
              tvUrl={`https://www.tradingview.com/symbols/${symbol.replace(":", "-")}/`}
              metrics={metricsPanel}
              name={name ?? ticker}
            />
          ) : (
            <StockView symbol={symbol} metrics={metricsPanel} />
          )}
        </div>
        <section className="card h-fit p-4">
          <h2 className="mb-1 text-sm font-semibold text-ink">News</h2>
          <HeadlineList items={news.slice(0, 15)} />
        </section>
      </div>
    </>
  );
}
