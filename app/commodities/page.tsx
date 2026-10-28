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
  { symbol: "TVC:GOLD/TVC:SILVER", title: "Gold / silver", note: "Rises in risk-off phases" },
  { symbol: "CAPITALCOM:COPPER/TVC:GOLD", title: "Copper / gold", note: "Growth signal; often tracks bond yields" },
  { symbol: "TVC:UKOIL/FX:GBPUSD", title: "Brent in sterling", note: "£ per barrel: what matters for UK inflation" },
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
          </Card>
          <Card
            title="US crude stocks"
            subtitle={`Commercial, excl. SPR, million barrels (EIA weekly).${lastWeek ? ` Latest week ${lastWeek[1] > 0 ? "+" : ""}${lastWeek[1].toFixed(1)}m bbl.` : ""}`}
          >
            <SeriesChart series={[{ key: "s", name: "Crude stocks", color: "var(--series-2)", points: stocks }]} xKind="date" unit="price" height={260} showLegend={false} />
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
        />
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink">Ratios</h2>
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
