"use client";

import { useMemo, useRef, useState } from "react";
import { GiltScatter, RangePicker, SeriesChart, type Series } from "./charts";

export interface MonitorRow {
  isin: string;
  name: string;
  type: "conventional" | "index-linked";
  maturity: string;
  years: number;
  cleanPrice: number | null;
  yield: number | null;
  yieldComputed?: boolean;
  oisSpread: number | null; // ASW proxy, bp
  richCheap: number | null;
  bei: number | null;
  modDuration: number | null;
  d1: number | null;
  w1: number | null;
  m1: number | null;
  live?: boolean;
  held?: string;
  outlier?: boolean; // hidden from the curve chart
}

type Filter = "conventional" | "index-linked" | "all";
type SortKey = keyof MonitorRow;
type History = Record<string, { name: string; type: string; points: [string, number | null, number | null][] }>;

const f = (v: number | null | undefined, dp: number, signed = false) => {
  if (v == null) return "–";
  const s = v.toFixed(dp);
  if (Number(s) === 0) return (0).toFixed(dp); // no "-0.0"
  return `${signed && v > 0 ? "+" : ""}${s}`;
};

// Colour follows the selected bond: first pick is slot 1, second is slot 2, spread slot 3.
const PICK_COLORS = ["var(--series-1)", "var(--series-2)"];

export default function GiltMonitor({
  rows,
  fits,
}: {
  rows: MonitorRow[];
  fits: { conventional: { t: number; y: number }[]; "index-linked": { t: number; y: number }[] };
}) {
  const [filter, setFilter] = useState<Filter>("conventional");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "maturity", dir: 1 });
  const [selected, setSelected] = useState<string[]>([]);
  const [plot, setPlot] = useState<"yield" | "asw">("yield");
  const [mode, setMode] = useState<"yield" | "price">("yield");
  const [hiddenLines, setHiddenLines] = useState<string[]>([]);
  const [range, setRange] = useState("All");
  const [history, setHistory] = useState<History>({});
  const [loading, setLoading] = useState(false);
  const requested = useRef(new Set<string>());
  const toggleLine = (key: string) =>
    setHiddenLines((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]));

  // Each gilt's history is fetched once, the first time it is selected.
  const loadHistory = (isin: string) => {
    if (requested.current.has(isin)) return;
    requested.current.add(isin);
    setLoading(true);
    fetch(`/api/history?isin=${encodeURIComponent(isin)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((h: History) => setHistory((prev) => ({ ...prev, ...h })))
      .catch(() => requested.current.delete(isin))
      .finally(() => setLoading(false));
  };

  const toggle = (isin: string) => {
    if (!selected.includes(isin)) loadHistory(isin);
    setSelected((s) => (s.includes(isin) ? s.filter((x) => x !== isin) : [...s, isin].slice(-2)));
  };

  const shown = useMemo(() => {
    const ql = q.toLowerCase();
    return rows
      .filter((r) => filter === "all" || r.type === filter)
      .filter((r) => !ql || r.name.toLowerCase().includes(ql) || r.isin.toLowerCase().includes(ql))
      .sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [rows, filter, q, sort]);

  const scatterType = filter === "index-linked" ? "index-linked" : "conventional";
  const ofType = rows.filter((r) => r.type === scatterType);
  const hidden = ofType.filter((r) => r.outlier && r.yield != null);
  const scatterPoints = ofType
    .filter((r) => !r.outlier && (plot === "yield" ? r.yield : r.oisSpread) != null)
    .map((r) => ({
      id: r.isin,
      t: r.years,
      y: (plot === "yield" ? r.yield : r.oisSpread) as number,
      name: r.name,
      extra:
        plot === "yield"
          ? r.richCheap != null ? `${f(r.richCheap, 1, true)}bp vs fit` : undefined
          : r.yield != null ? `yield ${f(r.yield, 3)}%` : undefined,
    }));

  const byIsin = useMemo(() => new Map(rows.map((r) => [r.isin, r])), [rows]);
  // Top chart: each selected gilt's yield (or price). Bottom chart: the yield spread
  // between them in bp; kept separate because % and bp can't share one axis honestly.
  const { lineSeries, spreadSeries } = useMemo(() => {
    const pts = (isin: string, idx: 1 | 2) =>
      (history[isin]?.points ?? []).filter((p) => p[idx] != null).map((p) => [p[0], p[idx] as number] as [string, number]);
    const lineSeries: Series[] = selected.map((isin, i) => ({
      key: isin,
      name: byIsin.get(isin)?.name ?? history[isin]?.name ?? isin,
      color: PICK_COLORS[i],
      points: pts(isin, mode === "price" ? 1 : 2),
    }));
    let spreadSeries: Series | null = null;
    if (selected.length === 2) {
      const [a, b] = selected;
      const ya = new Map(pts(a, 2));
      spreadSeries = {
        key: "spread",
        name: `Yield spread: ${byIsin.get(b)?.name ?? b} − ${byIsin.get(a)?.name ?? a}`,
        color: "var(--series-3)",
        points: pts(b, 2).flatMap(([d, y]) => (ya.has(d) ? [[d, (y - ya.get(d)!) * 100] as [string, number]] : [])),
      };
    }
    return { lineSeries, spreadSeries };
  }, [history, selected, mode, byIsin]);
  const visibleLines = lineSeries.filter((s) => !hiddenLines.includes(s.key));
  const showSpread = spreadSeries != null && !hiddenLines.includes("spread");
  const allSeries = spreadSeries ? [...lineSeries, spreadSeries] : lineSeries;

  const cols: { key: SortKey; label: string; title?: string; fmt: (r: MonitorRow) => string; linkerOnly?: boolean }[] = [
    { key: "maturity", label: "Maturity", fmt: (r) => r.maturity },
    { key: "years", label: "Yrs", fmt: (r) => f(r.years, 1) },
    { key: "cleanPrice", label: "Price", fmt: (r) => f(r.cleanPrice, 3) },
    {
      key: "yield",
      label: "Yield %",
      title: "Gross redemption yield; real yield for index-linked",
      fmt: (r) => f(r.yield, 3) + (r.yieldComputed ? "*" : ""),
    },
    {
      key: "oisSpread",
      label: "ASW bp",
      title: "Asset-swap proxy: yield minus SONIA OIS at the same maturity. Linkers: real yield plus BoE implied RPI, minus OIS",
      fmt: (r) => f(r.oisSpread, 1),
    },
    { key: "d1", label: "Δ1d", title: "Yield change, bp", fmt: (r) => f(r.d1, 1, true) },
    { key: "w1", label: "Δ1w", title: "Yield change, bp", fmt: (r) => f(r.w1, 1, true) },
    { key: "m1", label: "Δ1m", title: "Yield change, bp", fmt: (r) => f(r.m1, 1, true) },
    { key: "richCheap", label: "vs fit bp", title: "Yield minus the fitted curve (real curve for linkers). Positive = cheap", fmt: (r) => f(r.richCheap, 1, true) },
    { key: "bei", label: "BEI %", title: "Breakeven: fitted conventional yield at the same maturity minus the real yield", fmt: (r) => f(r.bei, 2), linkerOnly: true },
    { key: "modDuration", label: "ModDur", fmt: (r) => f(r.modDuration, 2) },
  ];
  const visibleCols = cols.filter((c) => !c.linkerOnly || filter !== "conventional");
  const hasHeld = rows.some((r) => r.held);

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(
            [
              ["conventional", "Conventionals"],
              ["index-linked", "Linkers (3m lag)"],
              ["all", "All"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full border border-line px-3 py-1 ${filter === k ? "bg-surface-2 font-medium text-ink" : "text-ink-2"}`}
            >
              {label}
            </button>
          ))}
          <span className="text-muted">{shown.length} gilts</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or ISIN"
            className="ml-auto w-48 rounded-md border border-line bg-surface px-2 py-1 text-ink"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5">
            {(["yield", "asw"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setPlot(k)}
                className={`rounded px-2.5 py-0.5 ${plot === k ? "bg-surface text-ink shadow-sm" : "text-ink-2"}`}
              >
                {k === "yield" ? (scatterType === "index-linked" ? "Real yield" : "Yield") : "ASW"}
              </button>
            ))}
          </div>
          {hidden.length > 0 && (
            <span className="text-muted" title={hidden.map((r) => r.name).join(", ")}>
              {hidden.length} hidden from chart (very short-dated or far off the curve; hover for names)
            </span>
          )}
        </div>
        <div className="mt-2">
          <GiltScatter
            points={scatterPoints}
            fitted={plot === "yield" ? fits[scatterType] : []}
            label={scatterType === "index-linked" ? "Linkers" : "Conventional gilts"}
            valueLabel={plot === "yield" ? (scatterType === "index-linked" ? "Real yield" : "Yield") : "ASW"}
            unit={plot === "yield" ? "pct" : "bp"}
            selected={selected}
            onSelect={toggle}
            height={280}
          />
        </div>
      </section>

      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-semibold text-ink">History</h2>
          {selected.length === 0 && (
            <span className="text-xs text-muted">Tick up to two gilts in the table (or click points above) to chart their yields and the spread between them.</span>
          )}
          {allSeries.map((line) => {
            const on = !hiddenLines.includes(line.key);
            return (
              <span key={line.key} className="inline-flex items-center rounded-full border border-line text-xs">
                <button
                  onClick={() => toggleLine(line.key)}
                  aria-pressed={on}
                  title={on ? "Hide this line" : "Show this line"}
                  className={`inline-flex items-center gap-1.5 py-0.5 pr-1.5 pl-2.5 ${on ? "text-ink" : "text-muted line-through"}`}
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: on ? line.color : "var(--axis)" }} />
                  {line.key === "spread" ? "Spread" : line.name}
                </button>
                {line.key !== "spread" && (
                  <button onClick={() => toggle(line.key)} title="Remove this gilt" className="pr-2 pl-0.5 text-muted hover:text-ink">
                    ✕
                  </button>
                )}
              </span>
            );
          })}
          {selected.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5 text-xs">
                {(["yield", "price"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded px-2.5 py-0.5 capitalize ${mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-2"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <RangePicker value={range} onChange={setRange} />
            </div>
          )}
        </div>
        {selected.length > 0 && (
          <div className="mt-3 space-y-4">
            {loading && !lineSeries.some((s) => s.points.length) ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted">Loading history…</div>
            ) : (
              <>
                {visibleLines.length > 0 && (
                  <SeriesChart
                    series={visibleLines}
                    xKind="date"
                    unit={mode === "price" ? "price" : "pct"}
                    zeroLine={false}
                    range={range}
                  />
                )}
                {showSpread && (
                  <div>
                    <div className="mb-1 text-xs text-ink-2">{spreadSeries!.name} (bp)</div>
                    <SeriesChart series={[spreadSeries!]} xKind="date" unit="bp" range={range} height={180} showLegend={false} />
                  </div>
                )}
                {!visibleLines.length && !showSpread && (
                  <p className="py-6 text-center text-sm text-muted">All lines hidden. Click a name above to show it.</p>
                )}
              </>
            )}
            {lineSeries.every((s) => s.points.length < 2) && !loading && (
              <p className="text-xs text-muted">
                Not much history yet. It builds up daily; run the data job with <code>gilt_days</code> to backfill.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="card p-4">
        <div className="overflow-x-auto">
          <table className="num w-full text-xs">
            <thead>
              <tr className="text-muted">
                <th className="w-6 py-1.5" />
                <th
                  className="cursor-pointer py-1.5 pr-3 text-left font-normal hover:text-ink"
                  onClick={() => setSort({ key: "name", dir: sort.key === "name" ? (-sort.dir as 1 | -1) : 1 })}
                >
                  Gilt{sort.key === "name" ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </th>
                {visibleCols.map((c) => (
                  <th
                    key={c.key}
                    title={c.title}
                    className="cursor-pointer py-1.5 pr-3 text-right font-normal whitespace-nowrap hover:text-ink"
                    onClick={() => setSort({ key: c.key, dir: sort.key === c.key ? (-sort.dir as 1 | -1) : 1 })}
                  >
                    {c.label}
                    {sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </th>
                ))}
                {hasHeld && <th className="py-1.5 pr-3 text-right font-normal">Held</th>}
                <th className="py-1.5 text-right font-normal" title="intraday = giltsyield.com, close = DMO close of business">
                  Src
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const idx = selected.indexOf(r.isin);
                return (
                  <tr
                    key={r.isin}
                    className={`cursor-pointer border-t border-line hover:bg-surface-2 ${idx >= 0 ? "bg-surface-2" : ""}`}
                    onClick={() => toggle(r.isin)}
                  >
                    <td className="py-1.5">
                      <input
                        type="checkbox"
                        checked={idx >= 0}
                        onChange={() => toggle(r.isin)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Chart ${r.name}`}
                        style={idx >= 0 ? { accentColor: PICK_COLORS[idx] } : undefined}
                      />
                    </td>
                    <td className="py-1.5 pr-3 text-left whitespace-nowrap text-ink" title={r.isin}>
                      {r.name}
                      {r.type === "index-linked" && filter === "all" && (
                        <span className="ml-1.5 rounded bg-surface-2 px-1 text-[10px] text-ink-2">IL</span>
                      )}
                    </td>
                    {visibleCols.map((c) => (
                      <td key={c.key} className="py-1.5 pr-3 text-right whitespace-nowrap text-ink-2">
                        {c.fmt(r)}
                      </td>
                    ))}
                    {hasHeld && <td className="py-1.5 pr-3 text-right text-ink-2">{r.held ?? ""}</td>}
                    <td className="py-1.5 text-right text-muted">
                      {r.cleanPrice == null && r.yield == null ? "" : r.live ? "intraday" : "close"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!shown.length && <p className="py-6 text-center text-sm text-muted">No gilts to show.</p>}
        </div>
        <p className="mt-3 text-xs text-muted">
          Changes are yield moves in bp from the current price (intraday if connected) to the close 1 business day,
          1 week and 1 month earlier. Linker yields are real; ASW and breakeven for linkers use BoE implied RPI and
          the fitted conventional curve, so treat them as relative-value indicators. * yield computed from the clean
          price.
        </p>
      </section>
    </div>
  );
}
