"use client";

import Link from "next/link";
import type { GridStock } from "./StockGrid";

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const colour = (v: number) => (v >= 0 ? "var(--down)" : "var(--up)");

/** Equal-weighted average move by sector, with each sector's best and worst stock. */
export default function SectorTable({ stocks, sectorOf }: { stocks: GridStock[]; sectorOf: Record<string, string> }) {
  const by = new Map<string, GridStock[]>();
  for (const s of stocks) {
    const sec = sectorOf[s.symbol];
    if (sec) by.set(sec, [...(by.get(sec) ?? []), s]);
  }
  const rows = [...by.entries()]
    .map(([sector, list]) => {
      const sorted = [...list].sort((a, b) => b.quote.change - a.quote.change);
      return { sector, n: list.length, avg: list.reduce((a, s) => a + s.quote.change, 0) / list.length, best: sorted[0], worst: sorted[sorted.length - 1] };
    })
    .sort((a, b) => b.avg - a.avg);
  if (!rows.length) return <p className="text-sm text-muted">No prices yet: they arrive with the next run of the data job.</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.avg)), 0.5);
  const link = (s: GridStock) => (
    <Link href={`/equities/stock?tvwidgetsymbol=${encodeURIComponent(s.symbol)}`} className="hover:text-accent">
      {s.name} <span style={{ color: colour(s.quote.change) }}>{pct(s.quote.change)}</span>
    </Link>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-normal">Sector</th>
            <th className="w-1/4 py-1 font-normal" />
            <th className="py-1 text-right font-normal">Avg move</th>
            <th className="hidden py-1 pl-4 font-normal md:table-cell">Best</th>
            <th className="hidden py-1 pl-4 font-normal md:table-cell">Worst</th>
          </tr>
        </thead>
        <tbody className="num">
          {rows.map((r) => (
            <tr key={r.sector} className="border-t border-line">
              <td className="py-1.5 text-ink">
                {r.sector} <span className="text-[11px] text-muted">({r.n})</span>
              </td>
              <td className="py-1.5">
                {/* A small bar centred on zero. */}
                <div className="relative h-2.5">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-[color:var(--axis)]" />
                  <div
                    className="absolute inset-y-0 rounded-sm"
                    style={{
                      background: colour(r.avg),
                      width: `${(Math.abs(r.avg) / max) * 50}%`,
                      left: r.avg >= 0 ? "50%" : `${50 - (Math.abs(r.avg) / max) * 50}%`,
                    }}
                  />
                </div>
              </td>
              <td className="py-1.5 text-right font-medium" style={{ color: colour(r.avg) }}>
                {pct(r.avg)}
              </td>
              <td className="hidden py-1.5 pl-4 text-xs text-ink-2 md:table-cell">{link(r.best)}</td>
              <td className="hidden py-1.5 pl-4 text-xs text-ink-2 md:table-cell">{r.n > 1 ? link(r.worst) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
