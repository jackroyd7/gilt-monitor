"use client";

import { useMemo, useState } from "react";
import { SeriesChart, type Series } from "./charts";
import { Card } from "./Tiles";

type Point = [string, number];

const f = (v: number | null | undefined, d = 1, sign = false) =>
  v == null ? "–" : `${sign && v > 0 ? "+" : ""}${v.toFixed(d)}`;
/** Colour a z-score: rich (negative) blue, cheap (positive) orange, only when it's notable. */
const zStyle = (z: number | null) =>
  z == null || Math.abs(z) < 1.5
    ? undefined
    : { color: z > 0 ? "var(--series-2)" : "var(--series-1)", fontWeight: 600 };

// ---------------------------------------------------------------- forwards

export function ForwardsPanel({
  curves,
  table,
}: {
  curves: Series[];
  table: { label: string; now: number | null; m1: number | null }[];
}) {
  return (
    <Card
      title="Forward curves"
      subtitle="BoE nominal zero curve and the forwards it implies (semi-annual %). A forward above spot means the curve prices higher rates later."
    >
      <SeriesChart series={curves} xKind="tenor" unit="pct" height={300} />
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-normal">Forward</th>
            <th className="py-1 text-right font-normal">Now</th>
            <th className="py-1 text-right font-normal">1m ago</th>
            <th className="py-1 text-right font-normal">Change</th>
          </tr>
        </thead>
        <tbody className="num">
          {table.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="py-1 text-ink">{r.label}</td>
              <td className="py-1 text-right text-ink">
                {r.now == null ? "–" : `${r.now.toFixed(2)}%`}
              </td>
              <td className="py-1 text-right text-ink-2">
                {r.m1 == null ? "–" : `${r.m1.toFixed(2)}%`}
              </td>
              <td className="py-1 text-right text-ink-2">
                {r.now == null || r.m1 == null
                  ? "–"
                  : `${f((r.now - r.m1) * 100, 0, true)}bp`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        &ldquo;5y5y&rdquo; is the 5-year rate starting in 5 years. Forwards
        include term premium, so they are not pure rate forecasts.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------- carry & roll / rich-cheap

export interface CarryRow {
  isin: string;
  name: string;
  maturity: string;
  years: number;
  yield: number;
  modDuration: number;
  carryBp: number;
  rollBp: number;
  breakevenBp: number;
  totalPct: number;
  richCheap: number | null;
  rcZ: number | null;
  rcHistory: Point[];
}

type Key =
  | "years"
  | "yield"
  | "carryBp"
  | "rollBp"
  | "breakevenBp"
  | "totalPct"
  | "richCheap"
  | "rcZ";
const COLS: {
  key: Key;
  label: string;
  title: string;
  d: number;
  sign?: boolean;
}[] = [
  { key: "years", label: "Yrs", title: "Years to maturity", d: 1 },
  { key: "yield", label: "Yield %", title: "Redemption yield", d: 3 },
  {
    key: "carryBp",
    label: "Carry bp",
    title: "Yield over repo for 3 months, in yield terms",
    d: 1,
    sign: true,
  },
  {
    key: "rollBp",
    label: "Roll bp",
    title: "Yield fall from rolling 3 months down the fitted curve",
    d: 1,
    sign: true,
  },
  {
    key: "breakevenBp",
    label: "C+R bp",
    title:
      "Carry + roll: how far the yield can rise in 3 months before the position loses",
    d: 1,
    sign: true,
  },
  {
    key: "totalPct",
    label: "3m ret %",
    title:
      "Carry + roll as % of price over 3 months (unchanged curve, funded at repo)",
    d: 2,
    sign: true,
  },
  {
    key: "richCheap",
    label: "vs fit bp",
    title: "Yield minus fitted curve; positive = cheap",
    d: 1,
    sign: true,
  },
  {
    key: "rcZ",
    label: "z (1y)",
    title: "Today's rich/cheap against its own past year; ±2 is unusual",
    d: 1,
    sign: true,
  },
];

export function CarryTable({
  rows,
  repo,
  repoLabel,
}: {
  rows: CarryRow[];
  repo: number;
  repoLabel: string;
}) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({
    key: "years",
    dir: 1,
  });
  const [open, setOpen] = useState<CarryRow | null>(null);
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        ((a[sort.key] ?? -Infinity) as number) >
        ((b[sort.key] ?? -Infinity) as number)
          ? sort.dir
          : -sort.dir,
      ),
    [rows, sort],
  );
  return (
    <Card
      title="Carry, roll-down and rich/cheap"
      subtitle={`Conventional gilts, 3-month horizon, curve unchanged, funded at ${repo.toFixed(2)}% (${repoLabel}). Click a column to sort, a gilt for its rich/cheap history.`}
    >
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-normal">Gilt</th>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  title={c.title}
                  className="py-1 text-right font-normal"
                >
                  <button
                    onClick={() =>
                      setSort((s) => ({
                        key: c.key,
                        dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : -1,
                      }))
                    }
                    className={
                      sort.key === c.key
                        ? "font-medium text-ink"
                        : "hover:text-ink"
                    }
                  >
                    {c.label}
                    {sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="num">
            {sorted.map((r) => (
              <tr
                key={r.isin}
                onClick={() => setOpen(r)}
                className={`cursor-pointer border-t border-line ${open?.isin === r.isin ? "bg-surface-2" : "hover:bg-surface-2/60"}`}
              >
                <td className="py-1 pr-2 whitespace-nowrap text-ink">
                  {r.name}
                </td>
                {COLS.map((c) => (
                  <td
                    key={c.key}
                    className="py-1 text-right text-ink"
                    style={c.key === "rcZ" ? zStyle(r.rcZ) : undefined}
                  >
                    {f(r[c.key] as number | null, c.d, c.sign)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="mt-4">
          <h3 className="mb-1 text-xs font-medium text-ink-2">
            {open.name}: yield minus fitted curve, bp (positive = cheap)
          </h3>
          <SeriesChart
            series={[
              {
                key: "rc",
                name: "vs fitted curve",
                color: "var(--series-1)",
                points: open.rcHistory,
              },
            ]}
            xKind="date"
            unit="bp"
            height={220}
            showLegend={false}
            defaultRange="All"
          />
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- switches & flies

export interface ScreenRow {
  id: string;
  label: string;
  value: number;
  chg1m: number | null;
  z3m: number | null;
  z1y: number | null;
  series: Point[];
}

export function ScreensPanel({
  switches,
  flies,
}: {
  switches: ScreenRow[];
  flies: ScreenRow[];
}) {
  const [kind, setKind] = useState<"switches" | "flies">("switches");
  const list = kind === "switches" ? switches : flies;
  const [selId, setSelId] = useState<string | null>(null);
  const sel = list.find((x) => x.id === selId) ?? list[0];
  const meanLine = (pts: Point[]) => {
    const xs = pts.slice(-252).map((p) => p[1]);
    const m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    return pts.slice(-252).map(([d]) => [d, +m.toFixed(2)] as Point);
  };
  return (
    <Card
      title="Switch and butterfly screen"
      subtitle="Ranked by how unusual today's level is against the past year (z-score). Switch = longer yield − shorter yield; butterfly = 2 × belly − wings. Positive z: spread wide / belly cheap."
    >
      <div
        className="mb-2 flex rounded-md border border-line text-xs w-fit"
        data-export-ignore
      >
        {(["switches", "flies"] as const).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setSelId(null);
            }}
            aria-pressed={kind === k}
            className={`px-2.5 py-1 ${kind === k ? "bg-surface-2 font-medium text-ink" : "text-ink-2"}`}
          >
            {k === "switches" ? "Switches" : "Butterflies"}
          </button>
        ))}
      </div>
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-normal">
                {kind === "switches" ? "Switch" : "Butterfly"}
              </th>
              <th className="py-1 text-right font-normal">Level bp</th>
              <th className="py-1 text-right font-normal">1m chg</th>
              <th className="py-1 text-right font-normal">z (3m)</th>
              <th className="py-1 text-right font-normal">z (1y)</th>
            </tr>
          </thead>
          <tbody className="num">
            {list.slice(0, 40).map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelId(r.id)}
                className={`cursor-pointer border-t border-line ${sel?.id === r.id ? "bg-surface-2" : "hover:bg-surface-2/60"}`}
              >
                <td className="py-1 pr-2 text-ink">{r.label}</td>
                <td className="py-1 text-right text-ink">
                  {f(r.value, 1, true)}
                </td>
                <td className="py-1 text-right text-ink-2">
                  {f(r.chg1m, 1, true)}
                </td>
                <td className="py-1 text-right" style={zStyle(r.z3m)}>
                  {f(r.z3m, 1, true)}
                </td>
                <td className="py-1 text-right" style={zStyle(r.z1y)}>
                  {f(r.z1y, 1, true)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && (
        <div className="mt-4">
          <h3 className="mb-1 text-xs font-medium text-ink-2">
            {sel.label}, bp
          </h3>
          <SeriesChart
            series={[
              {
                key: "s",
                name: "Spread",
                color: "var(--series-1)",
                points: sel.series,
              },
              {
                key: "m",
                name: "1-year average",
                color: "var(--axis)",
                dashed: true,
                points: meanLine(sel.series),
              },
            ]}
            xKind="date"
            unit="bp"
            height={220}
            defaultRange="All"
          />
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        From daily closes in the gilt history (about a year so far). Yield
        spreads between bonds also drift as they age down the curve, so a
        z-score is a prompt to look, not a signal by itself.
      </p>
    </Card>
  );
}
