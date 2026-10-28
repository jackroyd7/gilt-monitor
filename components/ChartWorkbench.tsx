"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_CHART_SYMBOL, MARKET_GROUPS, symbolName } from "@/config/markets";
import { SYMBOL_CATALOGUE } from "@/config/symbol-catalogue";
import SymbolPicker from "./SymbolPicker";
import TradingViewWidget from "./TradingViewWidget";

const RECENT_KEY = "gilt-monitor:recent-charts";
const nameOf = (s: string) => symbolName(s) ?? SYMBOL_CATALOGUE.find((c) => c.symbol === s)?.name ?? s;

/** Charts tab: search for an instrument and chart it full width. The symbol lives in the URL. */
export default function ChartWorkbench({ symbol }: { symbol?: string }) {
  const router = useRouter();
  const current = symbol || DEFAULT_CHART_SYMBOL;
  const [picking, setPicking] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [height, setHeight] = useState(640);

  useEffect(() => {
    const fit = () => setHeight(Math.max(420, window.innerHeight - 260));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Remember the last few instruments charted in this browser.
  useEffect(() => {
    let list: string[] = [];
    try {
      list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    } catch {}
    if (!Array.isArray(list)) list = [];
    list = [current, ...list.filter((s) => typeof s === "string" && s !== current)].slice(0, 8);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with browser storage
    setRecent(list);
  }, [current]);

  const open = (s: string) => router.push(`/charts?tvwidgetsymbol=${encodeURIComponent(s)}`);
  const quick = MARKET_GROUPS.flatMap((g) => g.symbols);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setPicking(true)}
          className="flex min-w-64 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-left text-sm text-muted sm:flex-none"
        >
          <span aria-hidden>⌕</span> Search instruments…
        </button>
        <select
          value=""
          onChange={(e) => e.target.value && open(e.target.value)}
          aria-label="Benchmarks"
          className="rounded-md border border-line bg-surface px-2 py-2 text-sm text-ink-2"
        >
          <option value="">Benchmarks…</option>
          {MARKET_GROUPS.map((g) => (
            <optgroup key={g.title} label={g.title}>
              {[...g.symbols, ...g.more].map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {recent.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Recent:</span>
          {recent.map((s) => (
            <button
              key={s}
              onClick={() => open(s)}
              className={`rounded-full border px-2.5 py-0.5 ${s === current ? "border-[color:var(--accent)] text-accent" : "border-line text-ink-2 hover:text-ink"}`}
            >
              {nameOf(s)}
            </button>
          ))}
        </div>
      )}
      <div className="card overflow-hidden">
        <div className="flex items-baseline gap-2 border-b border-line px-4 py-2">
          <h2 className="text-sm font-semibold text-ink">{nameOf(current)}</h2>
          <span className="text-xs text-muted">{current}</span>
        </div>
        <TradingViewWidget
          key={current}
          widget="advanced-chart"
          height={height}
          config={{
            width: "100%",
            height,
            symbol: current,
            interval: "D",
            range: "12M",
            timezone: "Europe/London",
            style: "2",
            allow_symbol_change: true,
            watchlist: quick.map((s) => s.symbol),
            details: false,
            calendar: false,
            hide_side_toolbar: false,
            support_host: "https://www.tradingview.com",
          }}
        />
      </div>
      {picking && (
        <SymbolPicker
          title="Chart an instrument"
          onClose={() => setPicking(false)}
          onPick={(s) => {
            setPicking(false);
            open(s.symbol);
          }}
        />
      )}
    </div>
  );
}
