import { connection } from "next/server";
import ChartWorkbench from "@/components/ChartWorkbench";
import { SeriesChart } from "@/components/charts";
import { rateSA } from "@/lib/analytics";
import { sortedDates } from "@/lib/curve";
import { loadMarket } from "@/lib/data";
import type { CurveId } from "@/lib/types";
import { PageHeader } from "@/components/Tiles";
import { normaliseTvSymbol } from "@/lib/tv-symbol";
import { stockHistory, widgetsServe } from "@/lib/stock-history";
import { yahooSymbol } from "@/lib/stocks";

export const metadata = { title: "Charts · Markets Monitor" };

export default async function ChartsPage({
  searchParams,
}: PageProps<"/charts">) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const symbol = normaliseTvSymbol(
    first(params.tvwidgetsymbol),
    first(params.exchange),
  );
  const own = (await ownYieldChart(symbol)) ?? (await ownStockChart(symbol));
  return (
    <>
      <PageHeader title="Charts">
        Search for an index, stock, currency pair, commodity or bond yield. Line
        chart by default; switch to candles, change interval or add indicators
        from the chart toolbar. Gilt yield histories are on Gilts → Gilts.
      </PageHeader>
      <ChartWorkbench symbol={symbol} own={own} />
    </>
  );
}

// TradingView's free charts don't carry government bond yields (TVC:GB10Y etc.), so those
// open our own chart from the BoE / Bundesbank / US Treasury curves where we have them.
const YIELD_CURVES: Record<string, [CurveId, string]> = {
  GB: ["uk_nominal", "BoE fitted gilt zero curve"],
  US: ["us_ust", "US Treasury par curve"],
  DE: ["de_bund", "Bundesbank zero curve"],
};

async function ownYieldChart(symbol: string | undefined) {
  const m = symbol?.match(/^TVC:([A-Z]{2})(\d{2})Y$/);
  if (!m) return undefined;
  const [, country, tenorText] = m;
  const tenor = Number(tenorText);
  const def = YIELD_CURVES[country];
  if (!def) {
    return (
      <div className="p-6 text-sm text-ink-2">
        TradingView&apos;s free charts don&apos;t include government bond
        yields, and we don&apos;t have daily data for this market.{" "}
        <a
          href={`https://www.tradingview.com/symbols/${symbol!.replace(":", "-")}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent"
        >
          Open {symbol} on TradingView ↗
        </a>
      </div>
    );
  }
  await connection();
  const set = (await loadMarket()).curves[def[0]];
  const points = set
    ? sortedDates(set).flatMap((d) => {
        const v = rateSA(set, d, tenor);
        return v == null ? [] : [[d, +v.toFixed(4)] as [string, number]];
      })
    : [];
  return (
    <div className="p-4">
      <SeriesChart
        series={[
          {
            key: "y",
            name: `${tenor}y yield`,
            color: "var(--series-1)",
            points,
          },
        ]}
        xKind="date"
        unit="pct"
        height={420}
        showLegend={false}
      />
      <p className="mt-2 text-xs text-muted">
        End of day, {def[1]} at {tenor} years (semi-annual %), as
        TradingView&apos;s free charts don&apos;t include bond yields. It can
        differ by a few bp from a benchmark bond&apos;s yield.
      </p>
    </div>
  );
}

// TradingView's free widgets only serve US-listed stocks, so London, Xetra, Paris and Asian
// listings are charted from Yahoo Finance's daily closes instead.
async function ownStockChart(symbol: string | undefined) {
  if (!symbol || widgetsServe(symbol) || !yahooSymbol(symbol)) return undefined;
  await connection();
  const h = await stockHistory(symbol);
  if (!h) {
    return (
      <div className="p-6 text-sm text-ink-2">
        No price history available for {symbol} right now.{" "}
        <a
          href={`https://www.tradingview.com/symbols/${symbol.replace(":", "-")}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent"
        >
          Open on TradingView ↗
        </a>
      </div>
    );
  }
  const unit = h.currency === "GBp" ? "p" : h.currency ? ` ${h.currency}` : "";
  return (
    <div className="p-4">
      <p className="mb-2 text-sm text-ink">
        <span className="num text-lg font-semibold">
          {h.price.toFixed(2)}
          {unit}
        </span>
        {h.exchange && (
          <span className="ml-2 text-xs text-muted">{h.exchange}</span>
        )}
      </p>
      <SeriesChart
        series={[
          {
            key: "p",
            name: "Close",
            color: "var(--series-1)",
            points: h.points,
          },
        ]}
        xKind="date"
        unit="price"
        height={420}
        showLegend={false}
      />
      <p className="mt-2 text-xs text-muted">
        Daily closes over two years from Yahoo Finance, as TradingView&apos;s
        free charts only carry US-listed stocks.{" "}
        <a
          href={`/equities/stock?tvwidgetsymbol=${encodeURIComponent(symbol)}`}
          className="text-accent"
        >
          Stock page →
        </a>
      </p>
    </div>
  );
}
