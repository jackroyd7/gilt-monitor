"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  EQUITY_MARKETS,
  HEATMAP_PERIODS,
  SECTOR_GROUPS,
  STYLE_CHARTS,
} from "@/config/equities";
import { STOCKS } from "@/config/stock-catalogue";
import type { StockQuotes } from "@/lib/stocks";
import { SECTOR_MARKETS, SECTOR_OF } from "@/config/sectors";
import SectorTable from "./SectorTable";
import { StockHeatGrid, StockMovers, type GridStock } from "./StockGrid";
import SymbolPicker from "./SymbolPicker";
import TradingViewWidget from "./TradingViewWidget";

const MARKET_KEY = "gilt-monitor:equity-market";
const SECTOR_KEY = "gilt-monitor:sector-market";

// Built from parts: whole-string Intl output differs slightly between server and browser.
function fmtAsOf(iso: string | undefined): string | null {
  if (!iso) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}
const STOCK_PATH = "/equities/stock";

function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {note && <p className="text-xs text-muted">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Heatmap, top movers, sectors and style for the chosen national market. */
export default function EquitiesBoard({ quotes }: { quotes?: StockQuotes }) {
  const router = useRouter();
  const [market, setMarket] = useState(EQUITY_MARKETS[0].id);
  const [period, setPeriod] = useState(HEATMAP_PERIODS[0].id);
  const [picking, setPicking] = useState(false);
  const m = EQUITY_MARKETS.find((x) => x.id === market) ?? EQUITY_MARKETS[0];
  const stocksIn = (group: string, prefix?: string): GridStock[] =>
    STOCKS.filter(
      (st) => st.group === group && (!prefix || st.symbol.startsWith(prefix)),
    ).flatMap((st) => {
      const q = quotes?.quotes[st.symbol];
      return q ? [{ symbol: st.symbol, name: st.name, quote: q }] : [];
    });
  const own: GridStock[] = m.own ? stocksIn(m.own.group, m.own.prefix) : [];
  const asOf = own
    .map((x) => x.quote.time)
    .sort()
    .pop();

  // Sector table market (its own dropdown; remembered per browser).
  const [sectorId, setSectorId] = useState<string>(SECTOR_MARKETS[0].id);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SECTOR_KEY);
      if (saved && SECTOR_MARKETS.some((x) => x.id === saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of a saved preference
        setSectorId(saved);
      }
    } catch {}
  }, []);
  const chooseSector = (id: string) => {
    setSectorId(id);
    try {
      localStorage.setItem(SECTOR_KEY, id);
    } catch {}
  };
  const sectorMarket: {
    id: string;
    label: string;
    tv?: string;
    group?: string;
  } = SECTOR_MARKETS.find((x) => x.id === sectorId) ?? SECTOR_MARKETS[0];
  const sectorStocks = sectorMarket.group ? stocksIn(sectorMarket.group) : [];
  const asOfFor = (list: GridStock[]) =>
    fmtAsOf(
      list
        .map((x) => x.quote.time)
        .sort()
        .pop(),
    );
  const asOfText = fmtAsOf(asOf);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MARKET_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of a saved preference
      if (saved && EQUITY_MARKETS.some((x) => x.id === saved)) setMarket(saved);
    } catch {}
  }, []);
  const choose = (id: string) => {
    setMarket(id);
    try {
      localStorage.setItem(MARKET_KEY, id);
    } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Market
          <select
            value={market}
            onChange={(e) => choose(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
          >
            {EQUITY_MARKETS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => setPicking(true)}
          className="ml-auto flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-muted"
        >
          <span aria-hidden>⌕</span> Look up a stock…
        </button>
      </div>

      {m.tv ? (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Panel
              title={`${m.label.split(" · ")[1]} heatmap`}
              note="Size = market cap, colour = performance. Hover a tile for details; click it for the stock page."
              action={
                <div className="flex rounded-md border border-line text-xs">
                  {HEATMAP_PERIODS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPeriod(p.id)}
                      aria-pressed={period === p.id}
                      className={`px-2 py-1 ${period === p.id ? "bg-surface-2 font-medium text-ink" : "text-ink-2"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              }
            >
              <TradingViewWidget
                key={`${m.id}-${period}`}
                widget="stock-heatmap"
                height={520}
                chartPath={STOCK_PATH}
                config={{
                  dataSource: m.tv.heatmap,
                  exchanges: [],
                  grouping: "sector",
                  blockSize: "market_cap_basic",
                  blockColor: period,
                  hasTopBar: false,
                  isDataSetEnabled: false,
                  isZoomEnabled: true,
                  hasSymbolTooltip: true,
                  isMonoSize: false,
                  width: "100%",
                  height: 520,
                }}
              />
            </Panel>
          </div>
          <div className="lg:col-span-2">
            <Panel
              title="Top movers"
              note="Gainers, losers and most active today. Click a stock for its page."
            >
              <TradingViewWidget
                key={m.id}
                widget="hotlists"
                height={520}
                chartPath={STOCK_PATH}
                config={{
                  exchange: m.tv.movers,
                  dateRange: "1D",
                  showChart: true,
                  showSymbolLogo: true,
                  showFloatingTooltip: false,
                  width: "100%",
                  height: 520,
                }}
              />
            </Panel>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Panel
              title={`${m.label.split(" · ")[1]}: today's moves`}
              note={`Large stocks on our list, by % change on the previous close${asOfText ? ` (prices as of ${asOfText} UK, delayed)` : ""}. Click a tile for the stock page.`}
            >
              <StockHeatGrid stocks={own} />
            </Panel>
          </div>
          <div className="lg:col-span-2">
            <Panel
              title="Top movers"
              note="Biggest risers and fallers among them."
            >
              <StockMovers stocks={own} />
            </Panel>
          </div>
        </div>
      )}

      <Panel
        title="Sector performance"
        note={
          sectorMarket.tv
            ? "Sector ETFs, today (live). Click one for its chart."
            : `Equal-weighted average move of the large stocks on our list, by sector${asOfFor(sectorStocks) ? ` (prices as of ${asOfFor(sectorStocks)} UK, delayed)` : ""}.`
        }
        action={
          <select
            value={sectorId}
            onChange={(e) => chooseSector(e.target.value)}
            aria-label="Sector market"
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
          >
            {SECTOR_MARKETS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        }
      >
        {sectorMarket.tv ? (
          <TradingViewWidget
            key={sectorMarket.id}
            widget="market-quotes"
            height={480}
            chartPath="/charts"
            lazy
            config={{
              width: "100%",
              height: 480,
              symbolsGroups: SECTOR_GROUPS.filter(
                (g) => g.name === sectorMarket.tv,
              ),
              showSymbolLogo: false,
            }}
          />
        ) : (
          <SectorTable stocks={sectorStocks} sectorOf={SECTOR_OF} />
        )}
      </Panel>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">
          Volatility and style
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {STYLE_CHARTS.map((c) => (
            <Panel
              key={c.symbol}
              title={c.title}
              note={c.note}
              action={
                <Link
                  href={`/charts?tvwidgetsymbol=${encodeURIComponent(c.symbol)}`}
                  className="text-xs text-accent"
                >
                  Full chart ↗
                </Link>
              }
            >
              <TradingViewWidget
                widget="advanced-chart"
                height={240}
                lazy
                config={{
                  width: "100%",
                  height: 240,
                  symbol: c.symbol,
                  interval: "D",
                  range: "12M",
                  timezone: "Europe/London",
                  style: "2",
                  hide_top_toolbar: true,
                  hide_legend: true,
                  hide_side_toolbar: true,
                  allow_symbol_change: false,
                  save_image: false,
                  details: false,
                  calendar: false,
                  support_host: "https://www.tradingview.com",
                }}
              />
            </Panel>
          ))}
        </div>
      </section>

      {picking && (
        <SymbolPicker
          title="Look up a stock"
          onClose={() => setPicking(false)}
          onPick={(s) => {
            setPicking(false);
            router.push(
              `${STOCK_PATH}?tvwidgetsymbol=${encodeURIComponent(s.symbol)}`,
            );
          }}
        />
      )}
    </div>
  );
}
