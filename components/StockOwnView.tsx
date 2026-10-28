import PriceTool from "./PriceTool";
import { TradingCard } from "./StockInsights";
import type { StockHistory } from "@/lib/stock-history";
import type { StockQuote } from "@/lib/stocks";

/** Our own stock page for exchanges TradingView's free widgets don't serve. */
export default function StockOwnView({
  history,
  quote,
  tvUrl,
  metrics,
  name,
}: {
  history: StockHistory | null;
  quote?: StockQuote;
  tvUrl: string;
  metrics?: React.ReactNode;
  name?: string;
}) {
  const currency = history?.currency ?? quote?.currency;
  const unit = currency === "GBp" || currency === "GBX" ? "p" : "";
  return (
    <div className="space-y-4">
      <TradingCard history={history} quote={quote} />
      <section className="card p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">Price chart</h2>
        <PriceTool
          points={history?.points ?? []}
          name={name ?? history?.symbol ?? "Price"}
          unit={unit}
          height={360}
        />
      </section>
      {metrics}
      <p className="text-xs text-muted">
        Delayed prices from Yahoo Finance; TradingView&apos;s free widgets
        don&apos;t carry this exchange.{" "}
        <a
          href={tvUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent"
        >
          Open on TradingView ↗
        </a>
      </p>
    </div>
  );
}
