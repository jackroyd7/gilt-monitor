"use client";

import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_TICK, fmtDate, toX } from "./charts";
import SymbolPicker from "./SymbolPicker";
import {
  alignTo,
  pctChange,
  rangeStart,
  rangeStats,
  sma,
  type Pt,
} from "@/lib/price-tools";

const RANGES = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y"];
const MAS = [
  { n: 20, color: "var(--series-5)", dash: "2 3" },
  { n: 50, color: "var(--muted)", dash: "6 3" },
  { n: 200, color: "var(--ink-2)", dash: "10 4" },
];
const CMP_COLORS = ["var(--series-2)", "var(--series-3)", "var(--series-4)"];

type Compare = { symbol: string; name: string; points?: Pt[]; error?: string };
type Row = {
  x: number;
  d: string;
  p: number;
  [k: string]: number | string | undefined;
};

const signed = (v: number, dp = 2) => `${v > 0 ? "+" : ""}${v.toFixed(dp)}%`;
const tone = (v: number) => ({ color: v >= 0 ? "var(--down)" : "var(--up)" });
const dmy = (d: string) => fmtDate(toX(d));

function Toggle({
  on,
  onClick,
  children,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`rounded px-2 py-0.5 text-xs ${on ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

/**
 * Price chart with tools, for instruments charted from Yahoo Finance: date ranges or custom
 * dates, moving averages, log scale, comparison with other instruments (rebased to this
 * one's price), and a measure of the % price change between any two points.
 */
export default function PriceTool({
  points,
  name,
  unit = "",
  height = 380,
}: {
  points: Pt[];
  name: string;
  unit?: string;
  height?: number;
}) {
  const last = points.at(-1)?.[0] ?? "";
  const [range, setRange] = useState("1Y");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [log, setLog] = useState(false);
  const [mas, setMas] = useState<Set<number>>(() => new Set());
  const [compares, setCompares] = useState<Compare[]>([]);
  const [picking, setPicking] = useState(false);
  const [measure, setMeasure] = useState<string[]>([]);
  const plot = useRef<HTMLDivElement>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  const start =
    range === "Custom" ? from || points[0]?.[0] || "" : rangeStart(last, range);
  const end = range === "Custom" && to ? to : last;

  const maSeries = useMemo(
    () => Object.fromEntries(MAS.map((m) => [m.n, sma(points, m.n)])),
    [points],
  );

  const rows = useMemo(() => {
    const idx = points
      .map((_, i) => i)
      .filter((i) => points[i][0] >= start && points[i][0] <= end);
    if (!idx.length) return [] as Row[];
    const dates = idx.map((i) => points[i][0]);
    const base = points[idx[0]][1];
    const cmpVals = compares.map((c) =>
      c.points ? alignTo(dates, c.points) : [],
    );
    const cmpBase = cmpVals.map((vals) => vals.find((v) => v != null));
    return idx.map((i, k) => {
      const row: Row = {
        x: toX(points[i][0]),
        d: points[i][0],
        p: points[i][1],
      };
      for (const m of MAS) {
        const a = maSeries[m.n][i];
        if (mas.has(m.n) && a != null) row[`m${m.n}`] = a;
      }
      // Comparisons start at this instrument's price, so the chart stays in price terms.
      cmpVals.forEach((vals, j) => {
        const b = cmpBase[j];
        const c = vals[k];
        if (b != null && c != null) {
          row[`c${j}`] = base * (c / b);
          row[`cp${j}`] = pctChange(b, c);
        }
      });
      return row;
    });
  }, [points, start, end, mas, maSeries, compares]);

  const stats = useMemo(
    () => rangeStats(rows.map((r) => [r.d, r.p] as Pt)),
    [rows],
  );

  const pointAt = (d: string) => rows.find((r) => r.d === d);
  const [ma, mb] = measure.map(pointAt);
  const measured =
    ma && mb
      ? (() => {
          // Always earlier → later, whichever point was clicked first.
          const [a, b] = ma.d <= mb.d ? [ma, mb] : [mb, ma];
          return {
            a,
            b,
            change: pctChange(a.p, b.p),
            diff: b.p - a.p,
            days: Math.round((b.x - a.x) / 86_400_000),
          };
        })()
      : null;
  const fromPoint = measure.length === 1 ? ma : undefined;

  // The row nearest the pointer, from where the click landed in the plot area (Recharts'
  // own active index can lag behind the finger on touch screens).
  const rowAtClient = (clientX: number) => {
    const box = plot.current
      ?.querySelector(".recharts-cartesian-grid")
      ?.getBoundingClientRect();
    if (!box || !box.width || rows.length < 2) return undefined;
    const x0 = rows[0].x;
    const x1 = rows[rows.length - 1].x;
    const t = x0 + ((clientX - box.left) / box.width) * (x1 - x0);
    let best = rows[0];
    for (const r of rows)
      if (Math.abs(r.x - t) < Math.abs(best.x - t)) best = r;
    return best;
  };

  const addCompare = (symbol: string, label: string) => {
    if (compares.length >= 3 || compares.some((c) => c.symbol === symbol))
      return;
    setCompares((cs) => [...cs, { symbol, name: label }]);
    fetch(`/api/prices?symbol=${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        const d = (await r.json()) as { points?: Pt[]; error?: string };
        setCompares((cs) =>
          cs.map((c) =>
            c.symbol === symbol
              ? {
                  ...c,
                  points: d.points,
                  error: d.points ? undefined : (d.error ?? "No data"),
                }
              : c,
          ),
        );
      })
      .catch(() =>
        setCompares((cs) =>
          cs.map((c) =>
            c.symbol === symbol ? { ...c, error: "Couldn't load" } : c,
          ),
        ),
      );
  };

  const fmtY = (v: number) =>
    v >= 1000 ? v.toFixed(0) : v.toFixed(v >= 100 ? 1 : 2);
  const fmtP = (v: number) =>
    `${v.toFixed(Math.abs(v) >= 10_000 ? 0 : 2)}${unit}`;
  const measureTone =
    measured && (measured.change >= 0 ? "var(--down)" : "var(--up)");

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-0.5 rounded-md bg-surface-2 p-0.5">
          {RANGES.map((r) => (
            <Toggle
              key={r}
              on={range === r}
              onClick={() => {
                setRange(r);
                setMeasure([]);
              }}
            >
              {r}
            </Toggle>
          ))}
          <Toggle
            on={range === "Custom"}
            onClick={() => {
              setRange("Custom");
              if (!from)
                setFrom(
                  start > (points[0]?.[0] ?? "")
                    ? start
                    : (points[0]?.[0] ?? ""),
                );
            }}
          >
            Custom
          </Toggle>
        </div>
        {range === "Custom" && (
          <div className="flex items-center gap-1 text-xs text-ink-2">
            <input
              type="date"
              value={from}
              min={points[0]?.[0]}
              max={to || last}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded border border-line bg-surface px-1.5 py-0.5 text-ink"
              aria-label="From"
            />
            to
            <input
              type="date"
              value={to || last}
              min={from}
              max={last}
              onChange={(e) => setTo(e.target.value)}
              className="rounded border border-line bg-surface px-1.5 py-0.5 text-ink"
              aria-label="To"
            />
          </div>
        )}
        <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5">
          <Toggle
            on={log}
            onClick={() => setLog((l) => !l)}
            title="Logarithmic price scale"
          >
            Log scale
          </Toggle>
        </div>
        <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5">
          {MAS.map((m) => (
            <Toggle
              key={m.n}
              on={mas.has(m.n)}
              title={`${m.n}-day moving average`}
              onClick={() =>
                setMas((s) => {
                  const n = new Set(s);
                  if (n.has(m.n)) n.delete(m.n);
                  else n.add(m.n);
                  return n;
                })
              }
            >
              {m.n}d MA
            </Toggle>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={compares.length >= 3}
          title="Overlay another instrument, rebased to this one's price at the start of the period"
          className="rounded-md border border-line px-2 py-0.5 text-xs text-ink-2 hover:text-ink disabled:opacity-50"
        >
          + Compare
        </button>
      </div>

      {/* Legend for comparisons and averages */}
      {(compares.length > 0 || mas.size > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4"
              style={{ background: "var(--series-1)" }}
            />
            {name}
          </span>
          {compares.map((c, j) => (
            <span key={c.symbol} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4"
                style={{ background: CMP_COLORS[j] }}
              />
              {c.name}
              {!c.points && !c.error && (
                <span className="text-muted">loading…</span>
              )}
              {c.error && (
                <span style={{ color: "var(--critical)" }}>{c.error}</span>
              )}
              <button
                type="button"
                onClick={() =>
                  setCompares((cs) => cs.filter((x) => x.symbol !== c.symbol))
                }
                className="text-muted hover:text-ink"
                aria-label={`Remove ${c.name}`}
              >
                ×
              </button>
            </span>
          ))}
          {MAS.filter((m) => mas.has(m.n)).map((m) => (
            <span key={m.n} className="inline-flex items-center gap-1.5">
              <svg width="16" height="4" aria-hidden>
                <line
                  x1="0"
                  y1="2"
                  x2="16"
                  y2="2"
                  stroke={m.color}
                  strokeWidth="2"
                  strokeDasharray={m.dash}
                />
              </svg>
              {m.n}-day average
            </span>
          ))}
          {compares.length > 0 && (
            <span className="text-muted">
              Comparisons start from {name}&apos;s price on the first day shown
            </span>
          )}
        </div>
      )}

      {/* Chart */}
      <div
        ref={plot}
        style={{ height }}
        className="w-full cursor-crosshair touch-manipulation select-none [&_*:focus]:outline-none"
        // Pointer events rather than click: the chart swallows taps on touch screens.
        onPointerDown={(e) => {
          down.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const d = down.current;
          down.current = null;
          // A drag or scroll isn't a pick.
          if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
          const r = rowAtClient(e.clientX);
          if (!r) return;
          setMeasure((m) =>
            m.length === 1 ? (m[0] === r.d ? m : [m[0], r.d]) : [r.d],
          );
        }}
      >
        {rows.length < 2 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            No prices in this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows}
              margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
            >
              <CartesianGrid vertical={false} strokeWidth={1} />
              <XAxis
                tick={AXIS_TICK}
                dataKey="x"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => fmtDate(v)}
                minTickGap={28}
              />
              <YAxis
                tick={AXIS_TICK}
                width={52}
                scale={log ? "log" : "auto"}
                domain={["auto", "auto"]}
                tickFormatter={fmtY}
                allowDataOverflow={log}
              />
              {measured && (
                <ReferenceArea
                  x1={measured.a.x}
                  x2={measured.b.x}
                  fill={measureTone!}
                  fillOpacity={0.07}
                />
              )}
              {measured && (
                <ReferenceLine
                  segment={[
                    { x: measured.a.x, y: measured.a.p },
                    { x: measured.b.x, y: measured.b.p },
                  ]}
                  stroke={measureTone!}
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
              )}
              {[ma, mb].map(
                (r, k) =>
                  r && (
                    <ReferenceDot
                      key={k}
                      x={r.x}
                      y={r.p}
                      r={5}
                      fill="var(--accent)"
                      stroke="var(--surface)"
                      strokeWidth={2}
                    />
                  ),
              )}
              <Tooltip
                cursor={{ stroke: "var(--axis)" }}
                content={({ active, payload }) => {
                  const r = active
                    ? (payload?.[0]?.payload as Row | undefined)
                    : undefined;
                  if (!r) return null;
                  // With one point picked, show the change from that point to the one under the cursor.
                  const since =
                    fromPoint && fromPoint.d !== r.d
                      ? fromPoint.d < r.d
                        ? pctChange(fromPoint.p, r.p)
                        : pctChange(r.p, fromPoint.p)
                      : null;
                  return (
                    <div className="card px-3 py-2 text-xs shadow-sm">
                      <div className="mb-1 font-medium text-ink">
                        {dmy(r.d)}
                      </div>
                      <div className="num text-ink">{fmtP(r.p)}</div>
                      {compares.map((c, j) =>
                        r[`cp${j}`] == null ? null : (
                          <div key={c.symbol} className="num text-ink-2">
                            {c.name}{" "}
                            <span style={tone(r[`cp${j}`] as number)}>
                              {signed(r[`cp${j}`] as number)}
                            </span>
                          </div>
                        ),
                      )}
                      {since != null ? (
                        <div className="num mt-1 text-ink-2">
                          {fromPoint!.d < r.d
                            ? `Since ${dmy(fromPoint!.d)}`
                            : `To ${dmy(fromPoint!.d)}`}{" "}
                          <span className="font-semibold" style={tone(since)}>
                            {signed(since)}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-1 text-[10px] text-muted">
                          {measure.length === 1
                            ? "Click a second point"
                            : "Click to measure from here"}
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              {MAS.filter((m) => mas.has(m.n)).map((m) => (
                <Line
                  key={m.n}
                  dataKey={`m${m.n}`}
                  stroke={m.color}
                  strokeWidth={1.25}
                  strokeDasharray={m.dash}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
              {compares.map((c, j) => (
                <Line
                  key={c.symbol}
                  dataKey={`c${j}`}
                  stroke={CMP_COLORS[j]}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
              <Line
                dataKey="p"
                stroke="var(--series-1)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Measure result */}
      <div className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {measured ? (
          <>
            <span className="text-ink-2">
              {dmy(measured.a.d)} → {dmy(measured.b.d)}{" "}
              <span className="text-muted">({measured.days} days)</span>
            </span>
            <span className="num text-ink">
              {fmtP(measured.a.p)} → {fmtP(measured.b.p)}
            </span>
            <span className="num text-ink-2">
              {measured.diff >= 0 ? "+" : "−"}
              {fmtP(Math.abs(measured.diff))}
            </span>
            <span
              className="num text-base font-semibold"
              style={tone(measured.change)}
            >
              {signed(measured.change)}
            </span>
            <button
              type="button"
              onClick={() => setMeasure([])}
              className="text-xs text-muted hover:text-ink"
            >
              Clear
            </button>
          </>
        ) : (
          <span className="text-xs text-muted">
            {measure.length === 1
              ? `From ${dmy(measure[0])}: click a second point on the chart.`
              : "Measure: click any two points on the chart to see the % price change between them."}
          </span>
        )}
      </div>

      {/* Stats for the period shown */}
      {stats && (
        <div className="num grid grid-cols-2 gap-x-6 gap-y-1 border-t border-line pt-2 text-xs text-ink-2 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            Change over period{" "}
            <span style={tone(stats.change)}>{signed(stats.change)}</span>
          </div>
          <div>
            Annualised{" "}
            {stats.annualised != null ? (
              <span style={tone(stats.annualised)}>
                {signed(stats.annualised, 1)}
              </span>
            ) : (
              <span className="text-muted">–</span>
            )}
          </div>
          <div>High {fmtP(stats.high)}</div>
          <div>Low {fmtP(stats.low)}</div>
          <div title="Largest fall from a high within the period">
            Max drawdown{" "}
            <span style={{ color: "var(--up)" }}>
              {stats.maxDrawdown.toFixed(1)}%
            </span>
          </div>
          <div title="Annualised standard deviation of daily returns">
            Volatility {stats.vol != null ? `${stats.vol.toFixed(1)}%` : "–"}
          </div>
        </div>
      )}

      {picking && (
        <SymbolPicker
          title="Compare with"
          onClose={() => setPicking(false)}
          onPick={(s) => {
            setPicking(false);
            addCompare(s.symbol, s.name);
          }}
        />
      )}
    </div>
  );
}
