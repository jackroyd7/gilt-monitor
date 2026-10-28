"use client";

import { useState } from "react";
import { SeriesChart } from "./charts";
import Modal from "./Modal";

type Point = [string, number];

export interface MacroCell {
  value: number;
  prev: number | null;
  period: string;
  source: string;
  note?: string;
  spark: Point[];
  history: Point[];
}
export interface MacroRow {
  id: string;
  label: string;
  group: string;
  unit: "%" | "k" | "£bn";
  cells: Record<string, MacroCell | undefined>;
}

const fmt = (v: number, unit: MacroRow["unit"]) => (unit === "k" ? `${v > 0 ? "+" : ""}${Math.round(v)}k` : unit === "£bn" ? `£${v.toFixed(1)}bn` : `${v.toFixed(1)}%`);

function Spark({ points }: { points: Point[] }) {
  if (points.length < 2) return null;
  const w = 64;
  const h = 18;
  const ys = points.map((p) => p[1]);
  const lo = Math.min(...ys);
  const span = Math.max(...ys) - lo || 1;
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - 1 - ((p[1] - lo) / span) * (h - 2)).toFixed(1)}`).join("");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="inline-block">
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="1.25" />
    </svg>
  );
}

/** Latest readings by indicator (rows) and economy (columns); click a row for history. */
export default function MacroBoard({ rows, economies }: { rows: MacroRow[]; economies: { id: string; name: string }[] }) {
  const [open, setOpen] = useState<MacroRow | null>(null);
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <>
      <div className="space-y-4">
        {groups.map((g) => {
          const list = rows.filter((r) => r.group === g);
          const cols = economies.filter((e) => list.some((r) => r.cells[e.id]));
          return (
            <section key={g} className="card p-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">{g}</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="w-56 py-1 font-normal">Indicator</th>
                      {cols.map((e) => (
                        <th key={e.id} className="py-1 font-normal">
                          {e.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} onClick={() => setOpen(r)} className="cursor-pointer border-t border-line align-top hover:bg-surface-2/60">
                        <td className="py-2 pr-2 text-ink">{r.label}</td>
                        {cols.map((e) => {
                          const c = r.cells[e.id];
                          if (!c) return <td key={e.id} className="py-2 text-muted">–</td>;
                          const chg = c.prev == null ? null : c.value - c.prev;
                          return (
                            <td key={e.id} className="py-2 pr-2" title={`${c.source}${c.note ? ` · ${c.note}` : ""}`}>
                              <div className="num flex items-baseline gap-1.5">
                                <span className="font-semibold text-ink">{fmt(c.value, r.unit)}</span>
                                {chg != null && Math.abs(chg) > 1e-9 && (
                                  <span className="text-[11px] text-ink-2">
                                    {chg > 0 ? "▲" : "▼"}
                                    {r.unit === "k" ? Math.abs(Math.round(chg)) : Math.abs(chg).toFixed(1)}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted">{c.period}</div>
                              <Spark points={c.spark} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
      {open && (
        <Modal size="full" title={open.label} subtitle="Hover the chart for values. Each cell's source is in its tooltip on the table." onClose={() => setOpen(null)}>
          <SeriesChart
            xKind="date"
            unit={open.unit === "k" ? "count" : "price"}
            height={420}
            defaultRange="All"
            zeroLine={open.unit !== "%"}
            series={economies.flatMap((e, i) => {
              const c = open.cells[e.id];
              return c ? [{ key: e.id, name: e.name, color: `var(--series-${(i % 5) + 1})`, dashed: i >= 5, points: c.history }] : [];
            })}
          />
        </Modal>
      )}
    </>
  );
}

export interface ImfTable {
  code: string;
  label: string;
  years: string[];
  rows: { name: string; values: (number | null)[] }[];
}

/** IMF World Economic Outlook: recent years and forecasts for each economy. */
export function ImfTables({ tables, firstForecast }: { tables: ImfTable[]; firstForecast: string }) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-ink">IMF World Economic Outlook</h2>
      <p className="mb-3 text-xs text-muted">Annual figures; shaded columns are IMF forecasts. Comparable across economies, but less timely than the national data above.</p>
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        {tables.map((t) => (
          <div key={t.code} className="overflow-x-auto">
            <h3 className="mb-1 text-xs font-medium text-ink-2">{t.label}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="py-1 text-left font-normal" />
                  {t.years.map((y) => (
                    <th key={y} className={`py-1 text-right font-normal ${y >= firstForecast ? "bg-surface-2" : ""}`}>
                      {y}
                      {y >= firstForecast ? "f" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="num">
                {t.rows.map((r) => (
                  <tr key={r.name} className="border-t border-line">
                    <td className="py-1 text-ink">{r.name}</td>
                    {r.values.map((v, i) => (
                      <td key={t.years[i]} className={`py-1 text-right text-ink ${t.years[i] >= firstForecast ? "bg-surface-2" : ""}`}>
                        {v == null ? "–" : v.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
