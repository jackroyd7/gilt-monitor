"use client";

import Link from "next/link";
import type { StockQuote } from "@/lib/stocks";

export interface GridStock {
  symbol: string;
  name: string;
  quote: StockQuote;
}

const href = (s: string) => `/equities/stock?tvwidgetsymbol=${encodeURIComponent(s)}`;
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

/** Tile colour: green for rises, red for falls, stronger with the size of the move (full at ±3%). */
const tint = (chg: number) => {
  const k = Math.min(1, Math.abs(chg) / 3);
  const c = chg >= 0 ? "var(--down)" : "var(--up)";
  return `color-mix(in srgb, ${c} ${Math.round(12 + k * 58)}%, var(--surface))`;
};

/** A heat grid of a market's large stocks by today's move. Click a tile for the stock page. */
export function StockHeatGrid({ stocks }: { stocks: GridStock[] }) {
  if (!stocks.length) return <p className="text-sm text-muted">No prices yet: they arrive with the next run of the data job.</p>;
  const sorted = [...stocks].sort((a, b) => b.quote.change - a.quote.change);
  return (
    <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {sorted.map((s) => (
        <Link
          key={s.symbol}
          href={href(s.symbol)}
          title={`${s.name}: ${s.quote.price.toFixed(2)} ${s.quote.currency ?? ""} (${pct(s.quote.change)})`}
          className="rounded px-1.5 py-2 text-center hover:outline hover:outline-1 hover:outline-[color:var(--ink)]"
          style={{ background: tint(s.quote.change) }}
        >
          <div className="truncate text-[11px] font-medium text-ink">{s.name}</div>
          <div className="num text-xs text-ink">{pct(s.quote.change)}</div>
        </Link>
      ))}
    </div>
  );
}

/** Biggest risers and fallers. */
export function StockMovers({ stocks }: { stocks: GridStock[] }) {
  if (!stocks.length) return <p className="text-sm text-muted">No prices yet.</p>;
  const sorted = [...stocks].sort((a, b) => b.quote.change - a.quote.change);
  const block = (title: string, list: GridStock[]) => (
    <div>
      <h3 className="mb-1 text-xs font-medium text-ink-2">{title}</h3>
      <table className="w-full text-sm">
        <tbody className="num">
          {list.map((s) => (
            <tr key={s.symbol} className="border-t border-line">
              <td className="py-1 pr-2">
                <Link href={href(s.symbol)} className="text-ink hover:text-accent">
                  {s.name}
                </Link>
              </td>
              <td className="py-1 text-right text-ink-2">{s.quote.price.toFixed(2)}</td>
              <td className="py-1 text-right font-medium" style={{ color: s.quote.change >= 0 ? "var(--down)" : "var(--up)" }}>
                {pct(s.quote.change)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-4">
      {block("Top risers", sorted.slice(0, 8))}
      {block("Top fallers", sorted.slice(-8).reverse())}
    </div>
  );
}
