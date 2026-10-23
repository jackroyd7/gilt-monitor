import { Card, PageHeader } from "@/components/Tiles";
import TradingViewWidget from "@/components/TradingViewWidget";
import { DEFAULT_CHART_SYMBOL, MARKET_GROUPS, TICKER_TAPE } from "@/config/markets";

export const metadata = { title: "Markets · Gilt Monitor" };

export default function MarketsPage() {
  const watchlist = MARKET_GROUPS.flatMap((g) => g.symbols.map((s) => s.symbol));
  return (
    <>
      <PageHeader title="Markets">
        Equities, FX and commodities from TradingView&apos;s embeddable widgets (prices may be delayed, depending on
        the exchange). Symbols are set in <code>config/markets.ts</code>. Click any instrument to open it in the big
        chart&apos;s symbol search, or type a symbol there.
      </PageHeader>
      <div className="card mb-4 overflow-hidden">
        <TradingViewWidget
          widget="ticker-tape"
          height={46}
          config={{ symbols: TICKER_TAPE.map((s) => ({ proName: s.symbol, title: s.name })), showSymbolLogo: false, displayMode: "adaptive" }}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {MARKET_GROUPS.map((g) => (
          <Card key={g.title} title={g.title}>
            <TradingViewWidget
              widget="market-overview"
              height={520}
              config={{
                dateRange: "3M",
                showChart: true,
                width: "100%",
                height: "100%",
                showSymbolLogo: false,
                showFloatingTooltip: true,
                tabs: [{ title: g.title, symbols: g.symbols.map((s) => ({ s: s.symbol, d: s.name })) }],
              }}
            />
          </Card>
        ))}
      </div>
      <div className="mt-4">
        <Card title="Chart" subtitle="Full TradingView chart: change symbol, interval and indicators from its toolbar">
          <TradingViewWidget
            widget="advanced-chart"
            height={560}
            config={{
              autosize: true,
              symbol: DEFAULT_CHART_SYMBOL,
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
        </Card>
      </div>
    </>
  );
}
