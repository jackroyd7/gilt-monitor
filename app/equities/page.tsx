import { connection } from "next/server";
import EarningsCalendar from "@/components/EarningsCalendar";
import EquitiesBoard from "@/components/EquitiesBoard";
import GlobalStockSearch from "@/components/GlobalStockSearch";
import HeadlineList from "@/components/HeadlineList";
import MarketsBoard, { TickerTape } from "@/components/MarketsBoard";
import { PageHeader } from "@/components/Tiles";
import { getEarnings } from "@/lib/earnings-fetch";
import { loadStockQuotes } from "@/lib/data";
import { getNews } from "@/lib/news-fetch";

export const metadata = { title: "Equities · Markets Monitor" };

export default async function EquitiesPage() {
  await connection();
  const [earnings, allNews, quotes] = await Promise.all([getEarnings(), getNews(), loadStockQuotes()]);
  const news = allNews.items.filter((i) => i.topics.includes("equities")).slice(0, 12);
  return (
    <>
      <PageHeader title="Equities">
        UK, US and large-cap European stocks. Data from TradingView&apos;s embeddable widgets (some prices are delayed,
        depending on the exchange).
      </PageHeader>
      <TickerTape />
      <div className="space-y-4">
        <GlobalStockSearch />
        <MarketsBoard groups={["Equity indices"]} />
        <EquitiesBoard quotes={quotes} />
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Earnings calendar</h2>
          {earnings ? (
            <EarningsCalendar events={earnings.events} today={new Date().toISOString().slice(0, 10)} error={earnings.error} />
          ) : (
            <p className="text-sm text-muted">
              Set <code>FINNHUB_API_KEY</code> in Vercel (free key from finnhub.io) to show upcoming results.
            </p>
          )}
        </section>
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold text-ink">Equities news</h2>
          <HeadlineList items={news} />
        </section>
      </div>
    </>
  );
}
