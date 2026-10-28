import { SeriesChart } from "./charts";
import type { StockHistory } from "@/lib/stock-history";
import type { StockQuote } from "@/lib/stocks";

type Point = [string, number];

const pctFrom = (pts: Point[], price: number, days: number | "ytd") => {
  const last = pts.at(-1)?.[0];
  if (!last) return null;
  const from =
    days === "ytd"
      ? `${Number(last.slice(0, 4)) - 1}-12-31`
      : new Date(Date.parse(last) - days * 86_400_000)
          .toISOString()
          .slice(0, 10);
  let base: number | null = null;
  for (const [d, v] of pts) {
    if (d > from) break;
    base = v;
  }
  return base ? (price / base - 1) * 100 : null;
};

const fmtPct = (v: number | null) =>
  v == null ? (
    <span className="text-muted">–</span>
  ) : (
    <span
      style={{ color: v >= 0 ? "var(--down)" : "var(--up)" }}
    >{`${v > 0 ? "+" : ""}${v.toFixed(2)}%`}</span>
  );

// LSE prices come in pence; show them as such.
const ccy = (c?: string) => (c === "GBp" ? "p" : c ? ` ${c}` : "");

/** Our own stock page for exchanges TradingView's free widgets don't serve. */
export default function StockOwnView({
  history,
  quote,
  tvUrl,
  metrics,
}: {
  history: StockHistory | null;
  quote?: StockQuote;
  tvUrl: string;
  metrics?: React.ReactNode;
}) {
  const price = history?.price ?? quote?.price;
  const pts = history?.points ?? [];
  const day =
    quote?.change ??
    (pts.length > 1 && price != null
      ? (price / pts[pts.length - 2][1] - 1) * 100
      : null);
  const currency = history?.currency ?? quote?.currency;
  return (
    <div className="space-y-4">
      <section className="card p-4">
        {price == null ? (
          <p className="text-sm text-muted">
            No price available for this stock right now.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-3xl font-semibold text-ink">
                {price.toFixed(2)}
                <span className="text-base font-normal text-ink-2">
                  {ccy(currency)}
                </span>
              </span>
              <span className="num text-lg">{fmtPct(day)}</span>
              {history?.exchange && (
                <span className="text-xs text-muted">{history.exchange}</span>
              )}
            </div>
            <div className="num mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <div>1 month {fmtPct(pctFrom(pts, price, 31))}</div>
              <div>3 months {fmtPct(pctFrom(pts, price, 92))}</div>
              <div>Year to date {fmtPct(pctFrom(pts, price, "ytd"))}</div>
              <div>1 year {fmtPct(pctFrom(pts, price, 366))}</div>
              {history?.low52 != null && history.high52 != null && (
                <div className="col-span-2 text-ink-2 sm:col-span-4">
                  52-week range {history.low52.toFixed(2)} –{" "}
                  {history.high52.toFixed(2)}
                  {ccy(currency)}
                </div>
              )}
            </div>
          </>
        )}
      </section>
      {metrics}
      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">Price history</h2>
        <SeriesChart
          series={[
            { key: "p", name: "Close", color: "var(--series-1)", points: pts },
          ]}
          xKind="date"
          unit="price"
          height={340}
          showLegend={false}
        />
      </section>
      <p className="text-xs text-muted">
        Delayed prices from Yahoo Finance; TradingView&apos;s free widgets
        don&apos;t carry this exchange. Charts, financials and company details:{" "}
        <a
          href={tvUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent"
        >
          open on TradingView ↗
        </a>
      </p>
    </div>
  );
}
