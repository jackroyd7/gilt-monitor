"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_TICK,
  fmtDate,
  Legend,
  RangePicker,
  RANGES,
  SeriesChart,
  toX,
} from "./charts";
import Modal from "./Modal";
import { Card } from "./Tiles";

type Point = [string, number];

export interface FxTile {
  id: string;
  name: string;
  digits: number;
  value: number | null;
  date?: string;
  chg1w: number | null;
  chg1m: number | null;
  ytd: number | null;
  spark: Point[];
  /** Full BoE history, for the popup chart. */
  history: Point[];
  /** TradingView symbol for a live chart, if there is one. */
  tvSymbol?: string;
  /** Where the price comes from (shown on hover and in the popup). */
  note?: string;
}

const pct = (v: number | null) =>
  v == null ? (
    <span className="text-muted">–</span>
  ) : (
    <span
      style={{ color: v > 0 ? "var(--down)" : v < 0 ? "var(--up)" : undefined }}
    >{`${v > 0 ? "+" : ""}${v.toFixed(2)}%`}</span>
  );

function Spark({ points }: { points: Point[] }) {
  if (points.length < 2) return null;
  const w = 120;
  const h = 28;
  const ys = points.map((p) => p[1]);
  const lo = Math.min(...ys);
  const span = Math.max(...ys) - lo || 1;
  const d = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - 2 - ((p[1] - lo) / span) * (h - 4)).toFixed(1)}`,
    )
    .join("");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="1.5" />
    </svg>
  );
}

/** Sterling levels (BoE 4pm rates) with 1w / 1m / YTD changes; a rise means sterling is stronger. */
export function FxTiles({ tiles }: { tiles: FxTile[] }) {
  const [open, setOpen] = useState<FxTile | null>(null);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <button
            key={t.id}
            onClick={() => setOpen(t)}
            className="card p-3 text-left hover:border-[color:var(--accent)]"
            title={
              t.date
                ? `${t.note ?? "BoE 4pm rate"}, ${t.date}. Click for the chart.`
                : "no data"
            }
          >
            <div className="text-xs text-ink-2">{t.name}</div>
            <div className="mt-1 text-2xl font-semibold text-ink">
              {t.value == null ? "–" : t.value.toFixed(t.digits)}
            </div>
            <div className="num mt-0.5 flex flex-wrap gap-x-2.5 text-xs text-ink-2">
              <span>1w {pct(t.chg1w)}</span>
              <span>1m {pct(t.chg1m)}</span>
              <span>YTD {pct(t.ytd)}</span>
            </div>
            <div className="mt-2">
              <Spark points={t.spark} />
            </div>
          </button>
        ))}
      </div>
      {open && (
        <Modal
          title={open.name}
          subtitle={open.note ?? "Bank of England daily 4pm London rate"}
          onClose={() => setOpen(null)}
        >
          <SeriesChart
            series={[
              {
                key: "v",
                name: open.name,
                color: "var(--series-1)",
                points: open.history,
              },
            ]}
            xKind="date"
            unit="price"
            height={360}
            showLegend={false}
          />
          {open.tvSymbol && (
            <p className="mt-3 text-sm">
              <Link
                href={`/charts?tvwidgetsymbol=${encodeURIComponent(open.tvSymbol)}`}
                className="text-accent"
              >
                Live intraday chart on the Charts tab ↗
              </Link>
            </p>
          )}
        </Modal>
      )}
    </>
  );
}

export interface RatesFxPair {
  id: string;
  title: string;
  fxName: string;
  spreadName: string;
  fx: Point[];
  spread: Point[];
  corr: Point[];
}

/** An FX rate (left axis) against a 2-year yield spread (right axis), with their rolling correlation. */
export function RatesVsFx({ pairs }: { pairs: RatesFxPair[] }) {
  const [id, setId] = useState(pairs[0]?.id);
  const [range, setRange] = useState("1Y");
  const p = pairs.find((x) => x.id === id) ?? pairs[0];
  const data = useMemo(() => {
    if (!p) return [];
    const days = RANGES.find((r) => r.key === range)?.days ?? Infinity;
    const all = [...p.fx, ...p.spread];
    const max = Math.max(...all.map((x) => toX(x[0])));
    const min = isFinite(days) ? max - days * 86400000 : -Infinity;
    const rows = new Map<number, { x: number; fx?: number; spread?: number }>();
    for (const [d, v] of p.fx)
      if (toX(d) >= min)
        rows.set(toX(d), { ...rows.get(toX(d)), x: toX(d), fx: v });
    for (const [d, v] of p.spread)
      if (toX(d) >= min)
        rows.set(toX(d), { ...rows.get(toX(d)), x: toX(d), spread: v });
    return [...rows.values()].sort((a, b) => a.x - b.x);
  }, [p, range]);
  if (!p) return null;
  const lastCorr = p.corr[p.corr.length - 1]?.[1];

  return (
    <Card
      title="Rates vs FX"
      subtitle="Sterling against the 2-year government yield gap. A positive correlation means the pair moves with relative rates."
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div
          className="flex rounded-md border border-line text-xs"
          data-export-ignore
        >
          {pairs.map((x) => (
            <button
              key={x.id}
              onClick={() => setId(x.id)}
              aria-pressed={x.id === p.id}
              className={`px-2.5 py-1 ${x.id === p.id ? "bg-surface-2 font-medium text-ink" : "text-ink-2"}`}
            >
              {x.title}
            </button>
          ))}
        </div>
        <span className="text-xs text-ink-2">
          3-month correlation of daily changes:{" "}
          <span className="num font-medium text-ink">
            {lastCorr == null ? "–" : lastCorr.toFixed(2)}
          </span>
        </span>
        <div className="ml-auto" data-export-ignore>
          <RangePicker value={range} onChange={setRange} />
        </div>
      </div>
      <Legend
        series={[
          { key: "fx", name: `${p.fxName} (left)`, color: "var(--series-1)" },
          {
            key: "spread",
            name: `${p.spreadName}, bp (right)`,
            color: "var(--series-2)",
          },
        ]}
      />
      <div style={{ height: 300 }} className="mt-2 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={AXIS_TICK}
              tickFormatter={fmtDate}
              minTickGap={24}
            />
            <YAxis
              yAxisId="fx"
              tick={AXIS_TICK}
              width={52}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => v.toFixed(3)}
            />
            <YAxis
              yAxisId="spread"
              orientation="right"
              tick={AXIS_TICK}
              width={44}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            <Tooltip
              labelFormatter={(v) => fmtDate(Number(v))}
              formatter={(v, k) =>
                k === "fx"
                  ? [Number(v).toFixed(4), p.fxName]
                  : [`${Number(v).toFixed(1)}bp`, p.spreadName]
              }
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                fontSize: 12,
              }}
            />
            <Line
              yAxisId="fx"
              dataKey="fx"
              stroke="var(--series-1)"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              yAxisId="spread"
              dataKey="spread"
              stroke="var(--series-2)"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-2">
        When UK yields rise relative to US or German yields, sterling usually strengthens. The lines moving together
        means rates are driving the currency; when they split, something else (risk appetite, politics, growth fears)
        is in charge.
      </p>
      <div className="mt-4">
        <h3 className="mb-1 text-xs font-medium text-ink-2">
          Rolling 3-month correlation
        </h3>
        <SeriesChart
          series={[
            {
              key: "c",
              name: "Correlation",
              color: "var(--series-3)",
              points: p.corr,
            },
          ]}
          xKind="date"
          unit="price"
          height={160}
          range={range}
          showLegend={false}
          zeroLine
        />
      </div>
    </Card>
  );
}

export interface CotSeries {
  id: string;
  name: string;
  date?: string;
  assetManagers: number | null;
  leveraged: number | null;
  amChange: number | null;
  levChange: number | null;
  amPctOi: number | null;
  levPctOi: number | null;
  history: { date: string; assetManagers: number; leveraged: number }[];
}

const signed = (v: number | null) =>
  v == null
    ? "–"
    : `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("en-GB")}`;

/** CFTC net futures positions by trader group. */
export function Positioning({
  rows,
  title = "Positioning (CFTC futures)",
  subtitle = "Net long contracts on CME currency futures, weekly (positions as of Tuesday, published Friday).",
  groups = ["Asset managers", "Leveraged funds"],
  label = "Currency",
  explainer,
}: {
  rows: CotSeries[];
  title?: string;
  subtitle?: string;
  groups?: [string, string];
  label?: string;
  /** Plain-English notes shown under "What this shows". */
  explainer?: React.ReactNode;
}) {
  const [id, setId] = useState(rows[0]?.id);
  const r = rows.find((x) => x.id === id) ?? rows[0];
  if (!r) return <Card title={title}>No CFTC data yet.</Card>;
  return (
    <Card title={title} subtitle={`${subtitle} Latest ${r.date ?? "–"}.`}>
      {explainer && (
        <details className="mb-3 rounded-md bg-surface-2/60 px-3 py-2 text-xs text-ink-2" data-export-ignore>
          <summary className="cursor-pointer font-medium text-ink">What this shows</summary>
          <div className="mt-2 space-y-1.5 leading-relaxed">{explainer}</div>
        </details>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-normal">{label}</th>
              <th className="py-1 text-right font-normal">{groups[0]}</th>
              <th className="py-1 text-right font-normal">1w chg</th>
              <th className="py-1 text-right font-normal">% OI</th>
              <th className="py-1 text-right font-normal">{groups[1]}</th>
              <th className="py-1 text-right font-normal">1w chg</th>
              <th className="py-1 text-right font-normal">% OI</th>
            </tr>
          </thead>
          <tbody className="num">
            {rows.map((x) => (
              <tr
                key={x.id}
                onClick={() => setId(x.id)}
                className={`cursor-pointer border-t border-line ${x.id === r.id ? "bg-surface-2" : "hover:bg-surface-2/60"}`}
              >
                <td className="py-1.5 text-ink">{x.name}</td>
                <td className="py-1.5 text-right text-ink">
                  {signed(x.assetManagers)}
                </td>
                <td className="py-1.5 text-right text-ink-2">
                  {signed(x.amChange)}
                </td>
                <td className="py-1.5 text-right text-ink-2">
                  {x.amPctOi == null ? "–" : `${x.amPctOi.toFixed(0)}%`}
                </td>
                <td className="py-1.5 text-right text-ink">
                  {signed(x.leveraged)}
                </td>
                <td className="py-1.5 text-right text-ink-2">
                  {signed(x.levChange)}
                </td>
                <td className="py-1.5 text-right text-ink-2">
                  {x.levPctOi == null ? "–" : `${x.levPctOi.toFixed(0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mt-4 mb-1 text-xs font-medium text-ink-2">
        {r.name}: net contracts (click a row to switch)
      </h3>
      <SeriesChart
        xKind="date"
        unit="count"
        height={220}
        defaultRange="2Y"
        zeroLine
        series={[
          {
            key: "am",
            name: groups[0],
            color: "var(--series-1)",
            points: r.history.map((h) => [h.date, h.assetManagers]),
          },
          {
            key: "lev",
            name: groups[1],
            color: "var(--series-2)",
            points: r.history.map((h) => [h.date, h.leveraged]),
          },
        ]}
      />
    </Card>
  );
}
