import Link from "next/link";
import { connection } from "next/server";
import BriefingCard from "@/components/BriefingCard";
import HeadlineList from "@/components/HeadlineList";
import MarketsBoard, { TickerTape } from "@/components/MarketsBoard";
import { Card, PageHeader, TileGrid } from "@/components/Tiles";
import TradingViewWidget from "@/components/TradingViewWidget";
import { headlineMetrics, tile } from "@/lib/analytics";
import { loadBriefing, loadMarket } from "@/lib/data";
import { getNews } from "@/lib/news-fetch";

export default async function OverviewPage() {
  await connection();
  const [briefing, { curves }, news] = await Promise.all([loadBriefing(), loadMarket(), getNews()]);
  const tiles = headlineMetrics(curves).slice(0, 5).map(tile);
  const top = [...news.items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8);
  return (
    <>
      <PageHeader title="Overview" />
      <div className="space-y-4">
        <BriefingCard briefing={briefing} now={new Date()} />
        <TickerTape />
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink">Gilts</h2>
            <Link href="/gilts" className="text-xs text-accent">
              Gilt dashboard →
            </Link>
          </div>
          <TileGrid tiles={tiles} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Economic calendar" subtitle="Medium and high-importance releases: UK, US, euro area, Germany, France, Japan, China. Times in UK time." exportable={false}>
            <TradingViewWidget
              widget="events"
              height={460}
              config={{ width: "100%", height: 460, importanceFilter: "0,1", countryFilter: "gb,us,eu,de,fr,jp,cn" }}
            />
          </Card>
          <Card title="Top headlines" subtitle="Most relevant to UK rates and markets this week" exportable={false}>
            <HeadlineList items={top} />
            <Link href="/news" className="mt-2 inline-block text-xs text-accent">
              All news →
            </Link>
          </Card>
        </div>
        <MarketsBoard />
      </div>
    </>
  );
}
