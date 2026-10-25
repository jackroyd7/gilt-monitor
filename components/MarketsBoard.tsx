"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_CHART_SYMBOL, MARKET_GROUPS, TICKER_TAPE, symbolName } from "@/config/markets";
import Modal from "./Modal";
import TradingViewWidget from "./TradingViewWidget";

// Clicks inside TradingView's widgets can't be intercepted (they run in TradingView's
// iframe), so the widgets link back to /markets?tvwidgetsymbol=... and this page opens
// the chart popup for that symbol. The name buttons under each strip open it directly.
const CHART_PATH = "/markets";

export default function MarketsBoard({ initialSymbol }: { initialSymbol?: string }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState<string | null>(initialSymbol ?? null);
  const watchlist = MARKET_GROUPS.flatMap((g) => g.symbols.map((s) => s.symbol));
  // A tall chart: most of the window height (popup header and padding take ~140px),
  // with a sensible floor on small screens.
  const [chartHeight, setChartHeight] = useState(640);
  useEffect(() => {
    const fit = () => setChartHeight(Math.max(420, Math.round(window.innerHeight * 0.92) - 140));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const close = () => {
    setSymbol(null);
    if (initialSymbol) router.replace("/markets", { scroll: false });
  };

  return (
    <>
      <div className="card mb-4 overflow-hidden">
        <TradingViewWidget
          widget="ticker-tape"
          height={46}
          chartPath={CHART_PATH}
          config={{ symbols: TICKER_TAPE.map((s) => ({ proName: s.symbol, title: s.name })), showSymbolLogo: false, displayMode: "adaptive" }}
        />
      </div>
      <div className="space-y-4">
        {MARKET_GROUPS.map((g) => (
          <section key={g.title} className="card p-4">
            <h2 className="text-sm font-semibold text-ink">{g.title}</h2>
            <div className="mt-2 -mx-1">
              <TradingViewWidget
                widget="tickers"
                height={84}
                chartPath={CHART_PATH}
                config={{ symbols: g.symbols.map((s) => ({ proName: s.symbol, title: s.name })), showSymbolLogo: false }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted">Chart:</span>
              {g.symbols.map((s) => (
                <button
                  key={s.symbol}
                  onClick={() => setSymbol(s.symbol)}
                  className="rounded-full border border-line px-2.5 py-0.5 text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  {s.name}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {symbol && (
        <Modal size="full" title={symbolName(symbol) ?? symbol} subtitle={`${symbol} · switch to candles, change interval or add indicators from the chart toolbar`} onClose={close}>
          <TradingViewWidget
            key={symbol}
            widget="advanced-chart"
            height={chartHeight}
            config={{
              // Explicit size rather than autosize, so the chart can't collapse to a strip.
              width: "100%",
              height: chartHeight,
              symbol: symbol || DEFAULT_CHART_SYMBOL,
              interval: "D",
              range: "12M",
              timezone: "Europe/London",
              style: "2", // line chart
              allow_symbol_change: true,
              watchlist,
              details: false,
              calendar: false,
              hide_side_toolbar: true,
              support_host: "https://www.tradingview.com",
            }}
          />
        </Modal>
      )}
    </>
  );
}
