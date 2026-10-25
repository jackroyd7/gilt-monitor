import { Card, PageHeader } from "@/components/Tiles";
import TradingViewWidget from "@/components/TradingViewWidget";
import { MARKET_GROUPS, TICKER_TAPE } from "@/config/markets";

export const metadata = { title: "Markets · Gilt Monitor" };

const CHART_PATH = "/markets/chart";

export default function MarketsPage() {
  return (
    <>
      <PageHeader title="Markets">
        Benchmark equity indices, FX spot rates and commodities from TradingView&apos;s embeddable widgets (some
        prices are delayed, depending on the exchange). Click any row, or the ticker tape, to open its chart here.
        Symbols are set in <code>config/markets.ts</code>.
      </PageHeader>
      <div className="card mb-4 overflow-hidden">
        <TradingViewWidget
          widget="ticker-tape"
          height={46}
          chartPath={CHART_PATH}
          config={{ symbols: TICKER_TAPE.map((s) => ({ proName: s.symbol, title: s.name })), showSymbolLogo: false, displayMode: "adaptive" }}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {MARKET_GROUPS.map((g) => (
          <Card key={g.title} title={g.title}>
            <TradingViewWidget
              widget="market-quotes"
              height={90 + g.symbols.length * 52}
              chartPath={CHART_PATH}
              config={{
                width: "100%",
                height: "100%",
                showSymbolLogo: false,
                symbolsGroups: [{ name: g.title, symbols: g.symbols.map((s) => ({ name: s.symbol, displayName: s.name })) }],
              }}
            />
          </Card>
        ))}
      </div>
    </>
  );
}
