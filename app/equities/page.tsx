import { connection } from "next/server";
import EquitiesBoard from "@/components/EquitiesBoard";
import HeadlineList from "@/components/HeadlineList";
import MarketsBoard, { TickerTape } from "@/components/MarketsBoard";
import { PageHeader } from "@/components/Tiles";
import { getNews } from "@/lib/news-fetch";

export const metadata = { title: "Equities · Markets Monitor" };

export default async function EquitiesPage() {
  await connection();
  const news = (await getNews()).items.filter((i) => i.topics.includes("equities")).slice(0, 12);
  return (
    <>
      <PageHeader title="Equities">
        UK, US and large-cap European stocks. Data from TradingView&apos;s embeddable widgets (some prices are delayed,
        depending on the exchange).
      </PageHeader>
      <TickerTape />
      <div className="space-y-4">
        <MarketsBoard groups={["Equity indices"]} />
        <EquitiesBoard />
        <section className="card p-4">
          <h2 className="mb-1 text-sm font-semibold text-ink">Equities news</h2>
          <HeadlineList items={news} />
        </section>
      </div>
    </>
  );
}
