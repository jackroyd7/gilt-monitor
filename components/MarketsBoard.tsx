"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_CHART_SYMBOL, MARKET_GROUPS, TICKER_TAPE, symbolName, type MarketSymbol } from "@/config/markets";
import { addCard, defaultLayout, layoutForStorage, moveCard, removeCard, sanitizeLayout, type MarketLayout } from "@/lib/market-layout";
import Modal from "./Modal";
import SymbolPicker from "./SymbolPicker";
import { SYMBOL_CATALOGUE } from "@/config/symbol-catalogue";
import TradingViewWidget from "./TradingViewWidget";

// Clicks inside TradingView's widgets can't be intercepted (they run in TradingView's
// iframe), so the ticker tape links back to /markets?tvwidgetsymbol=... and this page
// opens the chart popup for that symbol. Each benchmark card has a transparent button
// over it that opens the popup directly.
const CHART_PATH = "/charts";
const LAYOUT_KEY = "gilt-monitor:markets-layout:v1";
const CUSTOM = "__custom__";
const WIDGET_H = 78; // natural height of a one-symbol TradingView tickers widget
const CARD_SCALE = 1.35; // enlarge the widget (and its price) by this factor

function MarketCard({
  card,
  editing,
  index,
  count,
  onOpen,
  onRemove,
  onMove,
  onDragStart,
  onDrop,
}: {
  card: MarketSymbol;
  editing: boolean;
  index: number;
  count: number;
  onOpen: () => void;
  onRemove: () => void;
  onMove: (to: number) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-surface-2/40 ${over ? "border-[color:var(--accent)]" : "border-line"}`}
      onDragOver={(e) => {
        if (!editing) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop();
      }}
    >
      {/* TradingView's text can't be restyled inside its iframe, so the widget is scaled up as a
          whole to make the price easier to read. */}
      <div style={{ height: Math.round(WIDGET_H * CARD_SCALE) }} className="overflow-hidden">
        <div style={{ width: `${100 / CARD_SCALE}%`, transform: `scale(${CARD_SCALE})`, transformOrigin: "0 0" }}>
          <TradingViewWidget
            widget="tickers"
            height={WIDGET_H}
            config={{ symbols: [{ proName: card.symbol, title: card.name }], showSymbolLogo: false }}
          />
        </div>
      </div>
      {editing ? (
        // In edit mode the card is a drag handle with its own controls.
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          className="absolute inset-0 flex cursor-grab items-start justify-end gap-1 bg-[color:var(--surface)]/60 p-1.5 active:cursor-grabbing"
          title="Drag to reorder"
        >
          <span className="mr-auto self-center pl-2 text-xs font-medium text-ink">⠿ {card.name}</span>
          <button
            onClick={() => onMove(index - 1)}
            disabled={index === 0}
            aria-label={`Move ${card.name} left`}
            className="rounded border border-line bg-surface px-1.5 text-xs text-ink-2 disabled:opacity-30"
          >
            ←
          </button>
          <button
            onClick={() => onMove(index + 1)}
            disabled={index === count - 1}
            aria-label={`Move ${card.name} right`}
            className="rounded border border-line bg-surface px-1.5 text-xs text-ink-2 disabled:opacity-30"
          >
            →
          </button>
          <button
            onClick={onRemove}
            aria-label={`Remove ${card.name}`}
            className="rounded border border-line bg-surface px-1.5 text-xs text-ink-2 hover:text-[color:var(--critical)]"
          >
            ✕
          </button>
        </div>
      ) : (
        // The quote is drawn in TradingView's iframe; this layer makes the whole card open our chart popup.
        <button
          onClick={onOpen}
          aria-label={`Open ${card.name} chart`}
          title={`${card.name}: open chart`}
          className="absolute inset-0 cursor-pointer rounded-lg hover:bg-[color:var(--ink)]/[0.04] focus-visible:outline-2 focus-visible:outline-[color:var(--accent)]"
        />
      )}
    </div>
  );
}

/** The scrolling ticker tape; clicking a quote opens it on the Charts tab. */
export function TickerTape() {
  return (
    <div className="card mb-4 overflow-hidden">
      <TradingViewWidget
        widget="ticker-tape"
        height={46}
        chartPath={CHART_PATH}
        config={{ symbols: TICKER_TAPE.map((s) => ({ proName: s.symbol, title: s.name })), showSymbolLogo: false, displayMode: "adaptive" }}
      />
    </div>
  );
}

/** Editable benchmark cards for the given asset classes (all of them if omitted). */
export default function MarketsBoard({ groups }: { groups?: string[] }) {
  const [symbol, setSymbol] = useState<string | null>(null);
  const watchlist = MARKET_GROUPS.flatMap((g) => [...g.symbols, ...g.more].map((s) => s.symbol));
  const [layout, setLayout] = useState<MarketLayout>(defaultLayout);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<{ group: string; index: number } | null>(null);
  const [picking, setPicking] = useState<string | null>(null); // asset class the search was opened from

  // Where the layout is kept: on the server (shared by all your devices) when preference
  // storage is set up, otherwise in this browser. The browser copy is also a fast cache.
  const [sync, setSync] = useState<"checking" | "synced" | "local" | "error">("checking");
  const serverOn = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveLocal = (value: MarketLayout | null) => {
    try {
      if (value) localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutForStorage(value)));
      else localStorage.removeItem(LAYOUT_KEY);
    } catch {}
  };
  // Edits arrive in bursts (dragging, several removals), so save to the server shortly after the last one.
  const saveServer = (value: MarketLayout | null) => {
    if (!serverOn.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/prefs/markets-layout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value && layoutForStorage(value)) })
        .then((r) => setSync(r.ok ? "synced" : "error"))
        .catch(() => setSync("error"));
    }, 600);
  };

  useEffect(() => {
    let local: MarketLayout | null = null;
    try {
      local = sanitizeLayout(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null"));
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- show the cached layout while the server copy loads
    if (local) setLayout(local);
    fetch("/api/prefs/markets-layout")
      .then((r) => r.json())
      .then((d: { synced: boolean; layout: MarketLayout | null }) => {
        if (!d.synced) return setSync("local");
        serverOn.current = true;
        setSync("synced");
        if (d.layout) {
          setLayout(d.layout);
          saveLocal(d.layout);
        } else if (local) {
          // First device to connect: upload the layout already set up in this browser.
          saveServer(local);
        }
      })
      .catch(() => setSync("local"));
  }, []);

  const update = (group: string, fn: (list: MarketSymbol[]) => MarketSymbol[]) => {
    const next = { ...layout, [group]: fn(layout[group] ?? []) };
    setLayout(next);
    saveLocal(next);
    saveServer(next);
  };
  const reset = () => {
    // Save the defaults explicitly (not a delete), so other devices adopt them rather than
    // re-uploading their own cached layout as if nothing had been stored yet.
    const defaults = defaultLayout();
    setLayout(defaults);
    saveLocal(defaults);
    saveServer(defaults);
  };

  const onPick = (group: string, value: string) => {
    if (!value) return;
    if (value === CUSTOM) {
      setPicking(group);
      return;
    }
    if (editing) {
      const g = MARKET_GROUPS.find((x) => x.title === group);
      const card = [...(g?.symbols ?? []), ...(g?.more ?? [])].find((s) => s.symbol === value);
      if (card) update(group, (l) => addCard(l, card));
    } else setSymbol(value);
  };
  // A tall chart: most of the window height (popup header and padding take ~140px),
  // with a sensible floor on small screens.
  const [chartHeight, setChartHeight] = useState(640);
  useEffect(() => {
    const fit = () => setChartHeight(Math.max(420, Math.round(window.innerHeight * 0.92) - 140));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const close = () => setSymbol(null);
  const shownGroups = MARKET_GROUPS.filter((g) => !groups || groups.includes(g.title));

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
          {editing && (
            <span className="mr-auto text-muted">
              Drag cards (or use ← →) to reorder, ✕ to remove, and “Add…” to add.{" "}
              {sync === "synced"
                ? "Changes sync to all your devices."
                : sync === "error"
                  ? "Couldn't reach sync storage; saved in this browser for now."
                  : sync === "local"
                    ? "Saved in this browser only (connect storage in Vercel to sync devices)."
                    : ""}
            </span>
          )}
          {editing && (
            <button onClick={reset} className="rounded-md border border-line px-2.5 py-1 text-ink-2 hover:text-ink">
              Reset to defaults
            </button>
          )}
          <button
            onClick={() => setEditing((e) => !e)}
            aria-pressed={editing}
            className={`rounded-md border border-line px-2.5 py-1 ${editing ? "bg-[color:var(--accent)] text-white" : "bg-surface-2 text-ink"}`}
          >
            {editing ? "Done" : "Edit layout"}
          </button>
        </div>
        {shownGroups.map((g) => {
          const cards = layout[g.title] ?? [];
          const shown = new Set(cards.map((c) => c.symbol));
          const options = editing ? [...g.symbols, ...g.more].filter((s) => !shown.has(s.symbol)) : g.more;
          return (
            <section key={g.title} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-ink">{g.title}</h2>
                <select
                  value=""
                  onChange={(e) => onPick(g.title, e.target.value)}
                  aria-label={editing ? `Add to ${g.title.toLowerCase()}` : `More ${g.title.toLowerCase()}`}
                  className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-2"
                >
                  <option value="">{editing ? "Add…" : "More…"}</option>
                  {options.map((s) => (
                    <option key={s.symbol} value={s.symbol}>
                      {s.name}
                    </option>
                  ))}
                  <option value={CUSTOM}>{editing ? "Search for another…" : "Search any instrument…"}</option>
                </select>
              </div>
              {cards.length ? (
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {cards.map((c, i) => (
                    <MarketCard
                      key={c.symbol}
                      card={c}
                      editing={editing}
                      index={i}
                      count={cards.length}
                      onOpen={() => setSymbol(c.symbol)}
                      onRemove={() => update(g.title, (l) => removeCard(l, c.symbol))}
                      onMove={(to) => update(g.title, (l) => moveCard(l, i, to))}
                      onDragStart={() => setDragging({ group: g.title, index: i })}
                      onDrop={() => {
                        if (dragging?.group === g.title) update(g.title, (l) => moveCard(l, dragging.index, i));
                        setDragging(null);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">
                  No cards. {editing ? "Use “Add…” to add some." : "Click “Edit layout” to add some."}
                </p>
              )}
            </section>
          );
        })}
      </div>
      {picking && (
        <SymbolPicker
          title={editing ? `Add a card to ${picking}` : "Chart any instrument"}
          onClose={() => setPicking(null)}
          onPick={(s) => {
            if (editing) update(picking, (l) => addCard(l, s));
            else setSymbol(s.symbol);
            setPicking(null);
          }}
        />
      )}
      {symbol && (
        <Modal size="full" title={
            Object.values(layout).flat().find((c) => c.symbol === symbol)?.name ??
            symbolName(symbol) ??
            SYMBOL_CATALOGUE.find((c) => c.symbol === symbol)?.name ??
            symbol
          } subtitle={`${symbol} · switch to candles, change interval or add indicators from the chart toolbar`} onClose={close}>
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
