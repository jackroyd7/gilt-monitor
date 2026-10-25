import Link from "next/link";
import { PageHeader } from "@/components/Tiles";
import TradingViewWidget from "@/components/TradingViewWidget";
import { DEFAULT_CHART_SYMBOL, MARKET_GROUPS, symbolName } from "@/config/markets";

export const metadata = { title: "Chart · Gilt Monitor" };

/** Full chart for one instrument. The Markets widgets link here with ?tvwidgetsymbol=EXCHANGE:TICKER. */
export default async function MarketChartPage({ searchParams }: PageProps<"/markets/chart">) {
  const params = await searchParams;
  const raw = params.tvwidgetsymbol ?? params.symbol;
  const symbol = (Array.isArray(raw) ? raw[0] : raw)?.trim() || DEFAULT_CHART_SYMBOL;
  const watchlist = MARKET_GROUPS.flatMap((g) => g.symbols.map((s) => s.symbol));

  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/markets" className="text-ink-2 hover:text-ink">
          ← Markets
        </Link>
      </div>
      <PageHeader title={symbolName(symbol) ?? symbol}>
        {symbol}. Change the symbol, interval or indicators from the chart&apos;s toolbar; the list on the right holds
        the Markets benchmarks.
      </PageHeader>
      <div className="card overflow-hidden p-2">
        <TradingViewWidget
          key={symbol}
          widget="advanced-chart"
          height="calc(100vh - 260px)"
          config={{
            autosize: true,
            symbol,
            interval: "D",
            timezone: "Europe/London",
            style: "1",
            allow_symbol_change: true,
            watchlist,
            details: true,
            calendar: false,
            support_host: "https://www.tradingview.com",
          }}
        />
      </div>
    </>
  );
}
