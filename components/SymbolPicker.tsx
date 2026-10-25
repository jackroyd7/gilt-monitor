"use client";

import { useMemo, useState } from "react";
import { SYMBOL_CATALOGUE } from "@/config/symbol-catalogue";
import type { MarketSymbol } from "@/config/markets";
import { searchSymbols } from "@/lib/symbol-search";
import Modal from "./Modal";

/** Type-ahead for TradingView symbols: at most 8 suggestions from a short curated list. */
export default function SymbolPicker({
  title,
  onPick,
  onClose,
}: {
  title: string;
  onPick: (s: MarketSymbol) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchSymbols(q, SYMBOL_CATALOGUE, 8), [q]);
  const choose = (i: number) => results[i] && onPick({ symbol: results[i].symbol, name: results[i].name });

  return (
    <Modal title={title} subtitle="Type a name, nickname (cable, bund, brent), currency pair, or EXCHANGE:TICKER" onClose={onClose}>
      <input
        autoFocus
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(active);
          }
        }}
        placeholder="e.g. gilt 10y, cable, nikkei, audnzd"
        className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
        aria-label="Search symbols"
      />
      <ul className="mt-2" role="listbox">
        {results.map((r, i) => (
          <li key={r.symbol} role="option" aria-selected={i === active}>
            <button
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={`flex w-full items-baseline gap-3 rounded-md px-3 py-2 text-left text-sm ${i === active ? "bg-surface-2" : ""}`}
            >
              <span className="text-ink">{r.name}</span>
              <span className="text-xs text-muted">{r.group}</span>
              <span className="num ml-auto text-xs text-muted">{r.symbol}</span>
            </button>
          </li>
        ))}
      </ul>
      {q.trim() && !results.length && (
        <p className="mt-3 text-sm text-muted">
          No match in the shortlist. Type the exact TradingView symbol as EXCHANGE:TICKER (shown on tradingview.com).
        </p>
      )}
    </Modal>
  );
}
