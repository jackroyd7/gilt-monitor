import Link from "next/link";
import { connection } from "next/server";
import { FxTiles, Positioning, type FxTile } from "@/components/FxPanels";
import HeadlineList from "@/components/HeadlineList";
import MarketsBoard, { TickerTape } from "@/components/MarketsBoard";
import { Card, PageHeader } from "@/components/Tiles";
import TradingViewWidget from "@/components/TradingViewWidget";
import { SeriesChart } from "@/components/charts";
import { COMMODITY_COT, COMMODITY_SERIES } from "@/lib/commodities";
import { cotRowsFor } from "@/lib/cot-view";
import { addDays } from "@/lib/curve";
import { loadCommodities } from "@/lib/data";
import { pctChange, type Point } from "@/lib/fx";
import { getNews } from "@/lib/news-fetch";

export const metadata = { title: "Commodities · Markets Monitor" };

// Live quotes by sector (TradingView). CFD feeds stand in where exchange futures aren't
// licensed for free widgets.
const SECTORS = [
  {
    name: "Energy",
    symbols: [
      { name: "TVC:UKOIL", displayName: "Brent crude" },
      { name: "TVC:USOIL", displayName: "WTI crude" },
      { name: "CAPITALCOM:NATURALGAS", displayName: "US natural gas" },
      { name: "CAPITALCOM:GASOLINE", displayName: "Gasoline" },
      { name: "CAPITALCOM:HEATINGOIL", displayName: "Heating oil" },
    ],
  },
  {
    name: "Metals",
    symbols: [
      { name: "TVC:GOLD", displayName: "Gold" },
      { name: "TVC:SILVER", displayName: "Silver" },
      { name: "TVC:PLATINUM", displayName: "Platinum" },
      { name: "CAPITALCOM:COPPER", displayName: "Copper" },
      { name: "CAPITALCOM:ALUMINUM", displayName: "Aluminium" },
    ],
  },
  {
    name: "Agriculture",
    symbols: [
      { name: "CAPITALCOM:WHEAT", displayName: "Wheat" },
      { name: "CAPITALCOM:CORN", displayName: "Corn" },
      { name: "CAPITALCOM:SOYBEANS", displayName: "Soybeans" },
      { name: "CAPITALCOM:COFFEEARABICA", displayName: "Coffee" },
      { name: "CAPITALCOM:SUGAR", displayName: "Sugar" },
      { name: "CAPITALCOM:COCOA", displayName: "Cocoa" },
    ],
  },
];

const RATIOS = [
  {
    symbol: "TVC:GOLD/TVC:SILVER",
    title: "Gold / silver",
    note: "Ounces of silver per ounce of gold",
    explain: "Rising: gold (a haven) beating silver, which is half industrial metal, typical of risk-off or slowing growth. Falling: industrial demand and risk appetite picking up.",
  },
  {
    symbol: "CAPITALCOM:COPPER/TVC:GOLD",
    title: "Copper / gold",
    note: "Growth signal; often tracks bond yields",
    explain: "Copper follows industrial activity, gold follows fear and real rates. Rising: markets pricing stronger global growth; it often moves with 10-year Treasury yields.",
  },
  {
    symbol: "TVC:UKOIL/FX:GBPUSD",
    title: "Brent in sterling",
    note: "£ per barrel",
    explain: "Oil priced in pounds: what UK petrol, energy bills and inflation actually feel. A weaker pound pushes it up even when dollar oil prices are flat.",
  },
];

export default async function CommoditiesPage() {
  await connection();
  const [data, news] = await Promise.all([loadCommodities(), getNews()]);
  const series = (id: (typeof COMMODITY_SERIES)[number]["id"]): Point[] => (data?.prices[id] ?? []) as Point[];

  const tiles: FxTile[] = COMMODITY_SERIES.map((s) => {
    const pts = series(s.id);
    const last = pts[pts.length - 1];
    return {
      id: s.id,
      name: `${s.name}, ${s.unit}`,
      digits: s.digits,
      value: last?.[1] ?? null,
      date: last?.[0],
      chg1w: pctChange(pts, 7),
      chg1m: pctChange(pts, 31),
      ytd: pctChange(pts, "ytd"),
      spark: pts.slice(s.id === "CRUDE_STOCKS" ? -26 : -63),
      history: pts,
      tvSymbol: s.tv,
    };
  });

  const brent = series("BRENT");
  const wti = new Map(series("WTI"));
  const since = addDays(brent[brent.length - 1]?.[0] ?? "2020-01-01", -3 * 365);
  const spread: Point[] = brent.filter(([d]) => d >= since && wti.has(d)).map(([d, v]) => [d, +(v - wti.get(d)!).toFixed(2)]);

  const stocks = series("CRUDE_STOCKS").filter(([d]) => d >= since);
  const weekly: Point[] = stocks.slice(1).map(([d, v], i) => [d, +(v - stocks[i][1]).toFixed(2)]);
  const lastWeek = weekly[weekly.length - 1];

  const cotRows = cotRowsFor(COMMODITY_COT, data?.cot);
  const commodityNews = news.items.filter((i) => i.topics.includes("commodities")).slice(0, 10);

  return (
    <>
      <PageHeader title="Commodities">
        Energy, metals and agriculture. Live quotes and charts are TradingView&apos;s (some are CFD prices standing in for
        exchange futures); daily spot prices and US crude stocks are from FRED (EIA data), positioning from the CFTC.
      </PageHeader>
      <TickerTape />
      <div className="space-y-4">
        <MarketsBoard groups={["Commodities"]} />
        {data ? <FxTiles tiles={tiles} /> : <p className="text-sm text-muted">No commodity data yet: run the “Update market data” GitHub Action.</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Brent − WTI spread" subtitle="$/bbl, daily spot (EIA). Widens when seaborne crude tightens relative to US supply.">
            <SeriesChart series={[{ key: "s", name: "Brent − WTI", color: "var(--series-1)", points: spread }]} xKind="date" unit="price" height={260} showLegend={false} />
            <p className="mt-2 text-xs leading-relaxed text-ink-2">
              The premium of international (Brent) over US (WTI) crude. It widens with Middle East or Russia supply risk and
              shipping costs, and narrows when US output or export capacity is tight.
            </p>
          </Card>
          <Card
            title="US crude stocks"
            subtitle={`Commercial, excl. SPR, million barrels (EIA weekly).${lastWeek ? ` Latest week ${lastWeek[1] > 0 ? "+" : ""}${lastWeek[1].toFixed(1)}m bbl.` : ""}`}
          >
            <SeriesChart series={[{ key: "s", name: "Crude stocks", color: "var(--series-2)", points: stocks }]} xKind="date" unit="price" height={260} showLegend={false} />
            <p className="mt-2 text-xs leading-relaxed text-ink-2">
              Oil held in US commercial storage, reported every Wednesday. Bigger-than-expected builds weigh on prices; draws
              signal tight supply. Stocks usually build in spring and draw in summer driving season.
            </p>
          </Card>
        </div>
        <Card title="By sector" subtitle="Live quotes, today. Click one for its chart." exportable={false}>
          <TradingViewWidget widget="market-quotes" height={440} chartPath="/charts" lazy config={{ width: "100%", height: 440, symbolsGroups: SECTORS, showSymbolLogo: false }} />
        </Card>
        <Positioning
          rows={cotRows}
          title="Positioning (CFTC futures)"
          subtitle="Net long contracts, weekly disaggregated report (positions as of Tuesday, published Friday). Managed money is mostly hedge funds and CTAs."
          groups={["Managed money", "Producers & merchants"]}
          label="Contract"
          explainer={
            <>
              <p>
                From the US regulator&apos;s (CFTC) weekly &ldquo;disaggregated&rdquo; report on US futures markets. Numbers are{" "}
                <strong>net contracts</strong>: long minus short. Positive is a net bet on (or exposure to) higher prices.
              </p>
              <p>
                <strong>Managed money</strong> is hedge funds and CTAs: speculative positioning, the group that drives
                momentum. <strong>Producers &amp; merchants</strong> are oil companies, miners, farmers, refiners and traders who
                mostly <em>hedge</em> what they produce or use, so they are usually net short and move opposite to the
                speculators (selling forward more as prices rise). <strong>1w chg</strong> is the change on the previous week;{" "}
                <strong>% OI</strong> is the net position as a share of all open contracts, comparable across markets.
              </p>
              <p>
                How it is used: speculative positions near multi-year extremes flag a crowded trade, prone to sharp reversals
                if fundamentals disappoint (record longs) or to short-covering rallies (record shorts). A fast build-up shows
                money chasing a move. Brent and other ICE-listed contracts aren&apos;t in this US report, so oil here is WTI.
                Positions are as of Tuesday and published on Friday.
              </p>
            </>
          }
        />
        <section>
          <h2 className="text-sm font-semibold text-ink">Ratios</h2>
          <p className="mb-2 text-xs text-muted">One price divided by another over the past year: a rising line means the first is outperforming.</p>
          <div className="grid gap-4 md:grid-cols-3">
            {RATIOS.map((c) => (
              <section key={c.symbol} className="card p-4">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">{c.title}</h3>
                    <p className="text-xs text-muted">{c.note}</p>
                  </div>
                  <Link href={`/charts?tvwidgetsymbol=${encodeURIComponent(c.symbol)}`} className="text-xs text-accent">
                    Full chart ↗
                  </Link>
                </div>
                <TradingViewWidget
                  widget="advanced-chart"
                  height={240}
                  lazy
                  config={{
                    width: "100%",
                    height: 240,
                    symbol: c.symbol,
                    interval: "D",
                    range: "12M",
                    timezone: "Europe/London",
                    style: "2",
                    hide_top_toolbar: true,
                    hide_legend: true,
                    hide_side_toolbar: true,
                    allow_symbol_change: false,
                    save_image: false,
                    details: false,
                    calendar: false,
                    support_host: "https://www.tradingview.com",
                  }}
                />
                <p className="mt-2 text-xs leading-relaxed text-ink-2">{c.explain}</p>
              </section>
            ))}
          </div>
        </section>
        <Card title="Commodities news" exportable={false}>
          <HeadlineList items={commodityNews} />
        </Card>
      </div>
    </>
  );
}
