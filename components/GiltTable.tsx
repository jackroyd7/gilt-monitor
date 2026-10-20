"use client";

import { useMemo, useState } from "react";

export interface GiltTableRow {
  isin: string;
  name: string;
  type: string;
  maturity: string;
  years: number;
  coupon: number | null;
  cleanPrice: number | null;
  yield: number | null;
  yieldComputed?: boolean;
  modDuration: number | null;
  richCheap: number | null;
  oisSpread: number | null;
  bundSpread: number | null;
  ustSpread: number | null;
  held?: string; // e.g. holding size from the portfolio
  live?: boolean;
}

type Col = { key: keyof GiltTableRow; label: string; fmt: (r: GiltTableRow) => string; title?: string };

const f = (v: number | null | undefined, dp: number) => (v == null ? "–" : v.toFixed(dp));

const COLS: Col[] = [
  { key: "name", label: "Gilt", fmt: (r) => r.name },
  { key: "maturity", label: "Maturity", fmt: (r) => r.maturity },
  { key: "years", label: "Yrs", fmt: (r) => f(r.years, 1) },
  { key: "cleanPrice", label: "Clean", fmt: (r) => f(r.cleanPrice, 3) },
  { key: "yield", label: "Yield %", fmt: (r) => f(r.yield, 3) + (r.yieldComputed ? "*" : "") },
  { key: "modDuration", label: "ModDur", fmt: (r) => f(r.modDuration, 2) },
  { key: "richCheap", label: "vs fit bp", fmt: (r) => f(r.richCheap, 1), title: "Yield minus Nelson-Siegel fit. Positive = cheap" },
  { key: "oisSpread", label: "ASW bp", fmt: (r) => f(r.oisSpread, 1), title: "Asset-swap proxy: yield minus SONIA OIS at the same maturity (linkers: real yield plus BoE implied RPI)" },
  { key: "bundSpread", label: "vs Bund bp", fmt: (r) => f(r.bundSpread, 1) },
  { key: "ustSpread", label: "vs UST bp", fmt: (r) => f(r.ustSpread, 1) },
  { key: "live", label: "Price", fmt: (r) => (r.cleanPrice == null && r.yield == null ? "" : r.live ? "intraday" : "close"), title: "intraday = giltsyield.com, close = DMO close of business" },
];

export default function GiltTable({ rows, showHeld = false }: { rows: GiltTableRow[]; showHeld?: boolean }) {
  const [sort, setSort] = useState<{ key: keyof GiltTableRow; dir: 1 | -1 }>({ key: "maturity", dir: 1 });
  const [type, setType] = useState<"conventional" | "index-linked" | "all">("conventional");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const ql = q.toLowerCase();
    return rows
      .filter((r) => type === "all" || r.type === type)
      .filter((r) => !ql || r.name.toLowerCase().includes(ql) || r.isin.toLowerCase().includes(ql))
      .sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [rows, sort, type, q]);

  const cols = showHeld ? [...COLS, { key: "held", label: "Held", fmt: (r: GiltTableRow) => r.held ?? "" } as Col] : COLS;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(["conventional", "index-linked", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`rounded-full border border-line px-2.5 py-0.5 ${type === t ? "bg-surface-2 text-ink" : "text-ink-2"}`}
          >
            {t}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or ISIN"
          className="ml-auto rounded-md border border-line bg-surface px-2 py-1 text-ink"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="num w-full text-xs">
          <thead>
            <tr className="text-muted">
              {cols.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  className={`cursor-pointer py-1.5 pr-3 font-normal whitespace-nowrap hover:text-ink ${c.key === "name" ? "text-left" : "text-right"}`}
                  onClick={() => setSort({ key: c.key, dir: sort.key === c.key ? (-sort.dir as 1 | -1) : 1 })}
                >
                  {c.label}
                  {sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.isin} className={`border-t border-line ${r.held ? "bg-surface-2" : ""}`}>
                {cols.map((c) => (
                  <td
                    key={c.key}
                    className={`py-1.5 pr-3 whitespace-nowrap ${c.key === "name" ? "text-left text-ink" : "text-right text-ink-2"}`}
                    title={c.key === "name" ? r.isin : undefined}
                  >
                    {c.fmt(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="py-6 text-center text-sm text-muted">No gilts to show.</p>}
      </div>
      <p className="text-xs text-muted">
        * yield computed here from the DMO clean price. Spreads compare a coupon-bond yield with zero rates at the
        same maturity, so treat them as relative-value indicators rather than tradeable levels.
      </p>
    </div>
  );
}
