import { connection } from "next/server";
import ChartWorkbench from "@/components/ChartWorkbench";
import { SeriesChart } from "@/components/charts";
import { rateSA } from "@/lib/analytics";
import { sortedDates } from "@/lib/curve";
import { loadMarket } from "@/lib/data";
import type { CurveId } from "@/lib/types";
import { PageHeader } from "@/components/Tiles";
import { normaliseTvSymbol } from "@/lib/tv-symbol";

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
  const own = await ownYieldChart(symbol);
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
