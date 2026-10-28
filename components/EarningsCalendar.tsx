"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { EarningsEvent } from "@/lib/earnings";

const REGIONS = ["All", "US", "UK", "Europe", "Asia"] as const;
const HOUR: Record<string, string> = { bmo: "Before open", amc: "After close", dmh: "During hours" };
// Formatted by hand: Intl output differs slightly between the server and browsers, which
// would make the server-rendered page and the browser disagree.
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};
const money = (v: number | null) =>
  v == null ? "–" : Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(1)}bn` : Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(0)}m` : v.toFixed(0);

function Surprise({ actual, estimate, fmt }: { actual: number | null; estimate: number | null; fmt: (v: number | null) => string }) {
  if (actual == null) return <span className="text-muted">–</span>;
  const diff = estimate == null ? 0 : actual - estimate;
  return <span style={{ color: diff > 0 ? "var(--down)" : diff < 0 ? "var(--up)" : undefined }}>{fmt(actual)}</span>;
}

/** Upcoming reports and recent results for the large stocks on our list. */
export default function EarningsCalendar({ events, today, error }: { events: EarningsEvent[]; today: string; error?: string }) {
  const [region, setRegion] = useState<(typeof REGIONS)[number]>("All");
  const [view, setView] = useState<"upcoming" | "recent">("upcoming");
  const shown = useMemo(
    () =>
      events
        .filter((e) => region === "All" || e.region === region)
        .filter((e) => (view === "upcoming" ? e.date >= today : e.date < today))
        .sort((a, b) => (view === "upcoming" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))),
    [events, region, view, today],
  );
  const eps = (v: number | null) => (v == null ? "–" : v.toFixed(2));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <div className="flex rounded-md border border-line">
          {(["upcoming", "recent"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`px-2.5 py-1 ${view === v ? "bg-surface-2 font-medium text-ink" : "text-ink-2"}`}>
              {v === "upcoming" ? "Upcoming" : "Last week's results"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              aria-pressed={region === r}
              className={`rounded-full border px-2.5 py-0.5 ${region === r ? "border-[color:var(--accent)] text-accent" : "border-line text-ink-2"}`}
            >
              {r}
            </button>
          ))}
        </div>
        {error && <span style={{ color: "var(--critical)" }}>{error}</span>}
      </div>
      {shown.length ? (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-normal">Date</th>
                <th className="py-1 font-normal">Company</th>
                <th className="hidden py-1 font-normal sm:table-cell">Period</th>
                <th className="py-1 text-right font-normal">EPS est.</th>
                <th className="py-1 text-right font-normal">EPS</th>
                <th className="hidden py-1 text-right font-normal md:table-cell">Revenue est.</th>
                <th className="hidden py-1 text-right font-normal md:table-cell">Revenue</th>
              </tr>
            </thead>
            <tbody className="num">
              {shown.map((e) => (
                <tr key={`${e.symbol}-${e.date}`} className="border-t border-line">
                  <td className="py-1.5 whitespace-nowrap text-ink-2">
                    {day(e.date)}
                    {HOUR[e.hour] && <span className="block text-[11px] text-muted">{HOUR[e.hour]}</span>}
                  </td>
                  <td className="py-1.5">
                    <Link href={`/equities/stock?tvwidgetsymbol=${encodeURIComponent(e.symbol)}`} className="text-ink hover:text-accent">
                      {e.name}
                    </Link>
                    <span className="ml-1.5 text-[11px] text-muted">{e.region}</span>
                  </td>
                  <td className="hidden py-1.5 text-ink-2 sm:table-cell">{e.quarter && e.year ? `Q${e.quarter} ${e.year}` : "–"}</td>
                  <td className="py-1.5 text-right text-ink-2">{eps(e.epsEstimate)}</td>
                  <td className="py-1.5 text-right">
                    <Surprise actual={e.epsActual} estimate={e.epsEstimate} fmt={eps} />
                  </td>
                  <td className="hidden py-1.5 text-right text-ink-2 md:table-cell">{money(e.revenueEstimate)}</td>
                  <td className="hidden py-1.5 text-right md:table-cell">
                    <Surprise actual={e.revenueActual} estimate={e.revenueEstimate} fmt={money} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">No {view === "upcoming" ? "reports due" : "results"} for these stocks in this window.</p>
      )}
      <p className="mt-2 text-xs text-muted">
        From Finnhub, for the ~430 large UK, US, European and Asian stocks on our list. Asian companies with US-listed shares
        (TSMC, Toyota, Sony, Alibaba…) are matched on those. Actuals are green when they beat the estimate, red when they miss.
      </p>
    </div>
  );
}
