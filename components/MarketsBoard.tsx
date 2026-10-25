"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_CHART_SYMBOL, MARKET_GROUPS, TICKER_TAPE, symbolName } from "@/config/markets";
import Modal from "./Modal";
import TradingViewWidget from "./TradingViewWidget";

// Clicks inside TradingView's widgets can't be intercepted (they run in TradingView's
// iframe), so the ticker tape links back to /markets?tvwidgetsymbol=... and this page
// opens the chart popup for that symbol. Each benchmark card has a transparent button
// over it that opens the popup directly.
const CHART_PATH = "/markets";

export default function MarketsBoard({ initialSymbol }: { initialSymbol?: string }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState<string | null>(initialSymbol ?? null);
  const watchlist = MARKET_GROUPS.flatMap((g) => [...g.symbols, ...g.more].map((s) => s.symbol));
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">{g.title}</h2>
              <select
                value=""
                onChange={(e) => e.target.value && setSymbol(e.target.value)}
                aria-label={`More ${g.title.toLowerCase()}`}
                className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2"
              >
                <option value="">More…</option>
                {g.more.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {g.symbols.map((s) => (
                <div key={s.symbol} className="relative overflow-hidden rounded-lg border border-line bg-surface-2/40">
                  <TradingViewWidget
                    widget="tickers"
                    height={78}
                    config={{ symbols: [{ proName: s.symbol, title: s.name }], showSymbolLogo: false }}
                  />
                  {/* The quote is drawn in TradingView's iframe; this layer makes the whole card open our chart popup. */}
                  <button
                    onClick={() => setSymbol(s.symbol)}
                    aria-label={`Open ${s.name} chart`}
                    title={`${s.name}: open chart`}
                    className="absolute inset-0 cursor-pointer rounded-lg hover:bg-[color:var(--ink)]/[0.04] focus-visible:outline-2 focus-visible:outline-[color:var(--accent)]"
                  />
                </div>
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
