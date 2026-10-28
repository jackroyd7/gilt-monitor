"use client";

import { useEffect, useState } from "react";
import TradingViewWidget from "./TradingViewWidget";

/** Single-stock page: quote, chart, key financials, profile and technicals. */
export default function StockView({ symbol }: { symbol: string }) {
  const [height, setHeight] = useState(520);
  useEffect(() => {
    const fit = () => setHeight(Math.max(380, Math.min(640, window.innerHeight - 320)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="space-y-4">
      <div className="card p-2">
        <TradingViewWidget key={`info-${symbol}`} widget="symbol-info" height={190} config={{ symbol, width: "100%" }} />
      </div>
      <div className="card overflow-hidden">
        <TradingViewWidget
          key={`chart-${symbol}`}
          widget="advanced-chart"
          height={height}
          config={{
            width: "100%",
            height,
            symbol,
            interval: "D",
            range: "12M",
            timezone: "Europe/London",
            style: "2",
            allow_symbol_change: false,
            details: false,
            calendar: false,
            support_host: "https://www.tradingview.com",
          }}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-2 lg:col-span-2">
          <TradingViewWidget key={`fin-${symbol}`} widget="financials" height={560} lazy config={{ symbol, width: "100%", height: 560, displayMode: "regular" }} />
        </section>
        <div className="space-y-4">
          <section className="card p-2">
            <TradingViewWidget key={`ta-${symbol}`} widget="technical-analysis" height={420} lazy config={{ symbol, interval: "1D", width: "100%", height: 420, showIntervalTabs: true, displayMode: "single" }} />
          </section>
        </div>
      </div>
      <section className="card p-2">
        <TradingViewWidget key={`profile-${symbol}`} widget="symbol-profile" height={420} lazy config={{ symbol, width: "100%", height: 420 }} />
      </section>
    </div>
  );
}
