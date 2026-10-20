"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface Series {
  key: string;
  name: string;
  /** CSS color, normally var(--series-N). Slots are assigned by entity, never by rank. */
  color: string;
  points: [number | string, number][];
  dashed?: boolean;
}

type Unit = "pct" | "bp" | "price";
type XKind = "tenor" | "date";

const fmtVal = (v: number, unit: Unit) =>
  unit === "pct" ? `${v.toFixed(3)}%` : unit === "bp" ? `${v.toFixed(1)}bp` : v.toFixed(3);
const fmtTenor = (t: number) => (t < 1 ? `${Math.round(t * 12)}m` : `${+t.toFixed(1)}y`);
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
const toX = (x: number | string) => (typeof x === "string" ? Date.parse(x + "T00:00:00Z") : x);

const RANGES = [
  { key: "1M", days: 31 },
  { key: "3M", days: 92 },
  { key: "6M", days: 183 },
  { key: "1Y", days: 366 },
  { key: "2Y", days: 731 },
  { key: "All", days: Infinity },
];

export function Legend({ series }: { series: Pick<Series, "key" | "name" | "color" | "dashed">[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden>
            <line x1="0" y1="4" x2="16" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} />
          </svg>
          {s.name}
        </span>
      ))}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
  xKind,
  names,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string }[];
  label?: number;
  unit: Unit;
  xKind: XKind;
  names: Record<string, string>;
}) {
  if (!active || !payload?.length || label == null) return null;
  return (
    <div className="card px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium text-ink">{xKind === "date" ? fmtDate(label) : fmtTenor(label)}</div>
      {payload
        .filter((p) => p.value != null)
        .map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2 text-ink-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="flex-1">{names[p.dataKey]}</span>
            <span className="num text-ink">{fmtVal(p.value, unit)}</span>
          </div>
        ))}
    </div>
  );
}

/** Multi-series line chart over tenor (curves) or date (history), with one shared y-axis. */
export function SeriesChart({
  series,
  xKind,
  unit,
  height = 280,
  zeroLine = unit === "bp",
  defaultRange = "1Y",
}: {
  series: Series[];
  xKind: XKind;
  unit: Unit;
  height?: number;
  zeroLine?: boolean;
  defaultRange?: string;
}) {
  const [range, setRange] = useState(defaultRange);

  const { data, xMin } = useMemo(() => {
    const all = series.flatMap((s) => s.points.map((p) => toX(p[0])));
    const max = Math.max(...all);
    const days = RANGES.find((r) => r.key === range)?.days ?? Infinity;
    const min = xKind === "date" && isFinite(days) ? max - days * 86400000 : -Infinity;
    const byX = new Map<number, Record<string, number>>();
    for (const s of series) {
      for (const [x0, y] of s.points) {
        const x = toX(x0);
        if (x < min) continue;
        const row = byX.get(x) ?? { x };
        row[s.key] = y;
        byX.set(x, row);
      }
    }
    return { data: [...byX.values()].sort((a, b) => a.x - b.x), xMin: min };
  }, [series, range, xKind]);

  const names = Object.fromEntries(series.map((s) => [s.key, s.name]));
  const empty = data.length === 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend series={series} />
        {xKind === "date" && (
          <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5 text-xs">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`rounded px-2 py-0.5 ${range === r.key ? "bg-surface text-ink shadow-sm" : "text-ink-2"}`}
              >
                {r.key}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ height }} className="w-full">
        {empty ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">No data for this view yet</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} strokeWidth={1} />
              <XAxis
                dataKey="x"
                type="number"
                scale={xKind === "tenor" ? "sqrt" : "linear"}
                domain={xKind === "date" && isFinite(xMin) ? [xMin, "dataMax"] : ["dataMin", "dataMax"]}
                tickFormatter={(v) => (xKind === "date" ? fmtDate(v) : fmtTenor(v))}
                ticks={xKind === "tenor" ? [1, 2, 5, 10, 20, 30, 40].filter((t) => t <= data[data.length - 1].x) : undefined}
                minTickGap={24}
              />
              <YAxis
                width={48}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => (unit === "bp" ? v.toFixed(0) : unit === "pct" ? v.toFixed(2) : v.toFixed(1))}
              />
              {zeroLine && <ReferenceLine y={0} stroke="var(--axis)" />}
              <Tooltip
                content={<ChartTooltip unit={unit} xKind={xKind} names={names} />}
                cursor={{ stroke: "var(--axis)" }}
              />
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? "5 4" : undefined}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** Toggleable set of series (e.g. comparison dates) drawn with SeriesChart. */
export function ToggleSeriesChart({
  options,
  initial,
  ...rest
}: { options: Series[]; initial: string[] } & Omit<Parameters<typeof SeriesChart>[0], "series">) {
  const [on, setOn] = useState(initial);
  const shown = options.filter((o) => on.includes(o.key));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 text-xs">
        {options.map((o) => {
          const active = on.includes(o.key);
          return (
            <button
              key={o.key}
              onClick={() => setOn(active ? on.filter((k) => k !== o.key) : [...on, o.key])}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${
                active ? "border-line bg-surface-2 text-ink" : "border-line text-muted"
              }`}
              aria-pressed={active}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: active ? o.color : "var(--axis)" }} />
              {o.name}
            </button>
          );
        })}
      </div>
      <SeriesChart series={shown} {...rest} />
    </div>
  );
}

export interface ScatterPoint {
  id?: string;
  t: number;
  y: number;
  name: string;
  extra?: string;
}

/** Gilt yields vs maturity, with the fitted curve as a line. Click a point to select it. */
export function GiltScatter({
  points,
  fitted,
  label = "Conventional gilts",
  selected = [],
  onSelect,
  height = 340,
}: {
  points: ScatterPoint[];
  fitted: { t: number; y: number }[];
  label?: string;
  selected?: string[];
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const legend = [
    { key: "c", name: label, color: "var(--series-1)" },
    { key: "f", name: "Nelson-Siegel fit", color: "var(--series-2)" },
  ];
  const picked = points.filter((p) => p.id && selected.includes(p.id));
  return (
    <div className="space-y-2">
      <Legend series={legend} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} tickFormatter={fmtTenor} allowDuplicatedCategory={false} />
            <YAxis dataKey="y" width={48} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(2)} />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as ScatterPoint | undefined;
                if (!active || !p?.name) return null;
                return (
                  <div className="card px-3 py-2 text-xs shadow-sm">
                    <div className="font-medium text-ink">{p.name}</div>
                    <div className="num text-ink-2">
                      {fmtTenor(p.t)} · {p.y.toFixed(3)}%{p.extra ? ` · ${p.extra}` : ""}
                    </div>
                    {onSelect && <div className="mt-1 text-muted">Click to {selected.includes(p.id ?? "") ? "deselect" : "select"}</div>}
                  </div>
                );
              }}
            />
            <Line data={fitted} dataKey="y" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Scatter
              data={points}
              fill="var(--series-1)"
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
              cursor={onSelect ? "pointer" : undefined}
              onClick={(d) => {
                const id = (d as unknown as { payload?: ScatterPoint })?.payload?.id ?? (d as unknown as ScatterPoint)?.id;
                if (id && onSelect) onSelect(id);
              }}
            />
            {picked.length > 0 && (
              <Scatter data={picked} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2.5} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Monthly totals, e.g. upcoming coupons and redemptions. */
export function MonthlyBars({ data, height = 240 }: { data: { month: string; amount: number }[]; height?: number }) {
  if (!data.length) return <p className="py-6 text-center text-sm text-muted">No upcoming cash flows found</p>;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" minTickGap={16} />
          <YAxis width={56} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="card px-3 py-2 text-xs shadow-sm">
                  <div className="font-medium text-ink">{label}</div>
                  <div className="num text-ink-2">£{Number(payload[0].value).toLocaleString("en-GB", { maximumFractionDigits: 0 })}</div>
                </div>
              ) : null
            }
          />
          <Bar dataKey="amount" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
