import Link from "next/link";
import { connection } from "next/server";
import HeadlineList from "@/components/HeadlineList";
import StockView from "@/components/StockView";
import { PageHeader } from "@/components/Tiles";
import { STOCKS } from "@/config/stock-catalogue";
import { getQueryNews } from "@/lib/news-fetch";
import { normaliseTvSymbol } from "@/lib/tv-symbol";

export const metadata = { title: "Stock · Markets Monitor" };

// TradingView symbols look like "LSE:SHEL" or "NYSE:BRK.B".
const VALID = /^[A-Z0-9_]+:[A-Z0-9._!-]+$/i;

export default async function StockPage({ searchParams }: PageProps<"/equities/stock">) {
  await connection();
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const symbol = normaliseTvSymbol(first(params.tvwidgetsymbol), first(params.exchange)) ?? "";
  if (!VALID.test(symbol)) {
    return (
      <PageHeader title="Stock">
        No stock chosen. Pick one from the <Link href="/equities" className="text-accent underline">Equities</Link> tab.
      </PageHeader>
    );
  }
  const name = STOCKS.find((s) => s.symbol === symbol)?.name;
  const ticker = symbol.split(":")[1].replace(/\.$/, "");
  const news = await getQueryNews(name ? `"${name}" (shares OR stock OR results)` : `${ticker} stock`, "stock");
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
          <StockView symbol={symbol} />
        </div>
        <section className="card h-fit p-4">
          <h2 className="mb-1 text-sm font-semibold text-ink">News</h2>
          <HeadlineList items={news.slice(0, 15)} />
        </section>
      </div>
    </>
  );
}
