"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SPREADS, SPREAD_MENU } from "@/lib/rates-spreads";
import { SeriesChart } from "./charts";

type Point = [string, number];
const KEY = "gilt-monitor:rates-spreads:v2"; // v2: nine-panel default

const change = (pts: Point[], days: number) => {
  const last = pts.at(-1);
  if (!last) return null;
  const from = new Date(Date.parse(last[0]) - days * 86_400_000).toISOString().slice(0, 10);
  let base: number | null = null;
  for (const [d, v] of pts) {
    if (d > from) break;
    base = v;
  }
  return base == null ? null : last[1] - base;
};

/** The Spreads and slopes section: charts you choose from a menu, saved in this browser. */
export default function RatesSpreads() {
  const [ids, setIds] = useState<string[]>(DEFAULT_SPREADS);
  const [data, setData] = useState<Record<string, Point[]>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (Array.isArray(saved)) {
        const valid = saved.filter((id) => typeof id === "string" && SPREAD_MENU.some((m) => m.id === id));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of a saved preference
        setIds(valid);
      }
    } catch {}
  }, []);
  const save = (next: string[]) => {
    setIds(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };

  // Fetch any chosen series not loaded yet.
  const missing = ids.filter((id) => !(id in data));
  const missingKey = missing.join(",");
  useEffect(() => {
    if (!missingKey) return;
    fetch(`/api/rates/series?ids=${encodeURIComponent(missingKey)}`)
      .then((r) => r.json())
      .then((d: Record<string, Point[]>) => setData((prev) => ({ ...prev, ...d })))
      .catch(() => {});
  }, [missingKey]);

  const groups = useMemo(() => [...new Set(SPREAD_MENU.map((m) => m.group))], []);
  const available = SPREAD_MENU.filter((m) => !ids.includes(m.id));

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">Spreads and slopes</h2>
          <p className="text-xs text-muted">Daily, from the BoE, Bundesbank and US Treasury curves and FRED. Add or remove charts; your choice is saved in this browser.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value=""
            onChange={(e) => e.target.value && save([...ids, e.target.value])}
            aria-label="Add a chart"
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
          >
            <option value="">Add…</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {available
                  .filter((m) => m.group === g)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <button onClick={() => save(DEFAULT_SPREADS)} className="rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:text-ink">
            Reset
          </button>
        </div>
      </div>
      {ids.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ids.map((id) => {
            const def = SPREAD_MENU.find((m) => m.id === id)!;
            const pts = data[id];
            const last = pts?.at(-1)?.[1];
            const fmt = (v: number | null) =>
              v == null ? "–" : def.unit === "bp" ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(0)}bp` : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(0)}bp`;
            return (
              <section key={id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">{def.label}</h3>
                    <p className="text-xs text-muted">{def.note ?? def.group}</p>
                  </div>
                  <button onClick={() => save(ids.filter((x) => x !== id))} aria-label={`Remove ${def.label}`} className="px-1 text-ink-2 hover:text-ink">
                    ✕
                  </button>
                </div>
                <div className="num mt-1 mb-1 text-xs text-ink-2">
                  Latest <span className="font-medium text-ink">{last == null ? "–" : def.unit === "bp" ? `${last.toFixed(0)}bp` : `${last.toFixed(2)}%`}</span>
                  {" · "}1m {pts ? fmt(change(pts, 31)) : "–"}
                  {" · "}3m {pts ? fmt(change(pts, 92)) : "–"}
                </div>
                {pts ? (
                  <SeriesChart series={[{ key: "s", name: def.label, color: "var(--series-1)", points: pts }]} xKind="date" unit={def.unit} height={180} showLegend={false} />
                ) : (
                  <div className="flex h-[180px] items-center justify-center text-sm text-muted">Loading…</div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">No charts chosen. Use “Add…” to pick some.</p>
      )}
    </section>
  );
}
