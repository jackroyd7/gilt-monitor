import Link from "next/link";
import { connection } from "next/server";
import BriefingCard from "@/components/BriefingCard";
import HeadlineList from "@/components/HeadlineList";
import MarketsBoard, { TickerTape } from "@/components/MarketsBoard";
import { Card, PageHeader, TileGrid } from "@/components/Tiles";
import TradingViewWidget from "@/components/TradingViewWidget";
import { headlineMetrics, tile } from "@/lib/analytics";
import { londonClock } from "@/lib/briefing";
import { latestBriefing } from "@/lib/briefing-store";
import { prefsConfigured } from "@/lib/prefs-store";
import { loadMarket, loadPolicy } from "@/lib/data";
import { policyView } from "@/lib/policy-view";
import { getNews } from "@/lib/news-fetch";

export default async function OverviewPage() {
  await connection();
  const [briefing, { curves }, news, policy] = await Promise.all([latestBriefing(), loadMarket(), getNews(), loadPolicy()]);
  const boe = policyView(curves.uk_ois_fwd, policy);
  const tiles = headlineMetrics(curves).slice(0, 5).map(tile);
  const top = [...news.items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8);
  return (
    <>
      <PageHeader title="Overview" />
      <div className="space-y-4">
        <BriefingCard briefing={briefing} today={londonClock().date} shared={prefsConfigured()} />
        <TickerTape />
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink">Gilts</h2>
            <Link href="/gilts" className="text-xs text-accent">
              Gilt dashboard →
            </Link>
          </div>
          <TileGrid tiles={tiles} />
          {boe?.next && (
            <Link href="/gilts/boe" className="mt-2 block text-sm text-ink-2 hover:text-accent">
              <span className="font-medium text-ink">Bank Rate {boe.bank.toFixed(2)}%.</span> Next MPC {boe.next.label}:{" "}
              {Math.abs(boe.next.change) < 2 ? "no change priced" : `${boe.next.change > 0 ? "+" : "−"}${Math.abs(boe.next.change).toFixed(0)}bp priced`}
              {boe.end && <> · {boe.end.rate.toFixed(2)}% priced by {boe.end.label}</>} →
            </Link>
          )}
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
