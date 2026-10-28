"use client";

import { useEffect, useMemo, useState } from "react";
import { FWD_HORIZONS } from "@/lib/rv";
import { SeriesChart, type Series } from "./charts";
import { Card } from "./Tiles";

type Point = [string, number];

const f = (v: number | null | undefined, d = 1, sign = false) => (v == null ? "–" : `${sign && v > 0 ? "+" : ""}${v.toFixed(d)}`);
/** Colour a z-score: rich (negative) blue, cheap (positive) orange, only when it's notable. */
const zStyle = (z: number | null) =>
  z == null || Math.abs(z) < 1.5 ? undefined : { color: z > 0 ? "var(--series-2)" : "var(--series-1)", fontWeight: 600 };

// ---------------------------------------------------------------- forwards

export function ForwardsPanel({
  curves,
  table,
}: {
  curves: Series[];
  table: { label: string; now: number | null; m1: number | null; history: Point[] }[];
}) {
  const [sel, setSel] = useState<string | null>(null);
  const row = table.find((r) => r.label === sel);
  return (
    <Card title="Forward curves" subtitle="BoE nominal zero curve and the forwards it implies (semi-annual %). A forward above spot means the curve prices higher rates later.">
      <SeriesChart series={curves} xKind="tenor" unit="pct" height={300} />
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-1 font-normal">Forward (tap for history)</th>
            <th className="py-1 text-right font-normal">Now</th>
            <th className="py-1 text-right font-normal">1m ago</th>
            <th className="py-1 text-right font-normal">Change</th>
          </tr>
        </thead>
        <tbody className="num">
          {table.map((r) => (
            <tr
              key={r.label}
              onClick={() => setSel(sel === r.label ? null : r.label)}
              className={`cursor-pointer border-t border-line ${sel === r.label ? "bg-surface-2" : "hover:bg-surface-2/60"}`}
            >
              <td className="py-1 text-ink">{r.label}</td>
              <td className="py-1 text-right text-ink">{r.now == null ? "–" : `${r.now.toFixed(2)}%`}</td>
              <td className="py-1 text-right text-ink-2">{r.m1 == null ? "–" : `${r.m1.toFixed(2)}%`}</td>
              <td className="py-1 text-right text-ink-2">{r.now == null || r.m1 == null ? "–" : `${f((r.now - r.m1) * 100, 0, true)}bp`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {row && (
        <div className="mt-3">
          <h3 className="mb-1 text-xs font-medium text-ink-2">{row.label} forward rate, daily</h3>
          <SeriesChart series={[{ key: "f", name: row.label, color: "var(--series-1)", points: row.history }]} xKind="date" unit="pct" height={200} showLegend={false} />
        </div>
      )}
      <p className="mt-2 text-xs text-muted">&ldquo;5y5y&rdquo; is the 5-year rate starting in 5 years. Forwards include term premium, so they are not pure rate forecasts.</p>
    </Card>
  );
}

// ---------------------------------------------------------------- carry & roll / rich-cheap / bond forwards

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
  /** Forward yields by horizon id ("3m", "6m", "1y"). */
  fwd: Record<string, number | null>;
}

type Key = "years" | "yield" | "fwdYield" | "fwdSpread" | "carryBp" | "rollBp" | "breakevenBp" | "totalPct" | "richCheap" | "rcZ";
const COLS: { key: Key; label: string; title: string; d: number; sign?: boolean }[] = [
  { key: "years", label: "Yrs", title: "Years to maturity", d: 1 },
  { key: "yield", label: "Yield %", title: "Redemption yield", d: 3 },
  { key: "fwdYield", label: "Fwd yld %", title: "Forward yield for settlement at the chosen horizon, financed at repo", d: 3 },
  { key: "fwdSpread", label: "Fwd−spot bp", title: "Forward minus spot yield: how far the yield can rise by the forward date before a repo-financed position loses (carry only)", d: 1, sign: true },
  { key: "carryBp", label: "Carry bp", title: "Yield over repo for 3 months, in yield terms", d: 1, sign: true },
  { key: "rollBp", label: "Roll bp", title: "Yield fall from rolling 3 months down the fitted curve", d: 1, sign: true },
  { key: "breakevenBp", label: "C+R bp", title: "Carry + roll: how far the yield can rise in 3 months before the position loses", d: 1, sign: true },
  { key: "totalPct", label: "3m ret %", title: "Carry + roll as % of price over 3 months (unchanged curve, funded at repo)", d: 2, sign: true },
  { key: "richCheap", label: "vs fit bp", title: "Yield minus fitted curve; positive = cheap", d: 1, sign: true },
  { key: "rcZ", label: "z (1y)", title: "Today's rich/cheap against its own past year; ±2 is unusual", d: 1, sign: true },
];

export function CarryTable({ rows, repo, repoLabel }: { rows: CarryRow[]; repo: number; repoLabel: string }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "years", dir: 1 });
  const [horizon, setHorizon] = useState<string>(FWD_HORIZONS[0].id);
  const [open, setOpen] = useState<CarryRow | null>(null);
  const value = (r: CarryRow, k: Key): number | null => {
    if (k === "fwdYield") return r.fwd[horizon] ?? null;
    if (k === "fwdSpread") return r.fwd[horizon] == null ? null : (r.fwd[horizon]! - r.yield) * 100;
    return r[k];
  };
  const sorted = useMemo(
    () => [...rows].sort((a, b) => ((value(a, sort.key) ?? -Infinity) > (value(b, sort.key) ?? -Infinity) ? sort.dir : -sort.dir)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value() depends only on horizon
    [rows, sort, horizon],
  );
  return (
    <Card
      title="Carry, roll-down, forwards and rich/cheap"
      subtitle={`Conventional gilts, curve unchanged, funded at ${repo.toFixed(2)}% (${repoLabel}). Click a column to sort, a gilt for its rich/cheap history.`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-2" data-export-ignore>
        Forward horizon
        <div className="flex rounded-md border border-line">
          {FWD_HORIZONS.map((h) => (
            <button key={h.id} onClick={() => setHorizon(h.id)} aria-pressed={horizon === h.id} className={`px-2.5 py-1 ${horizon === h.id ? "bg-surface-2 font-medium text-ink" : ""}`}>
              {h.label}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-normal">Gilt</th>
              {COLS.map((c) => (
                <th key={c.key} title={c.title} className="py-1 text-right font-normal">
                  <button
                    onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : -1 }))}
                    className={sort.key === c.key ? "font-medium text-ink" : "hover:text-ink"}
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
              <tr key={r.isin} onClick={() => setOpen(r)} className={`cursor-pointer border-t border-line ${open?.isin === r.isin ? "bg-surface-2" : "hover:bg-surface-2/60"}`}>
                <td className="py-1 pr-2 whitespace-nowrap text-ink">{r.name}</td>
                {COLS.map((c) => (
                  <td key={c.key} className="py-1 text-right text-ink" style={c.key === "rcZ" ? zStyle(r.rcZ) : undefined}>
                    {f(value(r, c.key), c.d, c.sign)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="mt-4">
          <h3 className="mb-1 text-xs font-medium text-ink-2">{open.name}: yield minus fitted curve, bp (positive = cheap)</h3>
          <SeriesChart series={[{ key: "rc", name: "vs fitted curve", color: "var(--series-1)", points: open.rcHistory }]} xKind="date" unit="bp" height={220} showLegend={false} defaultRange="All" />
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        Forward yields: today&apos;s price financed at repo to the forward date, less coupons received, then priced as a yield
        on that date. Fwd − spot is the carry-only breakeven; C+R also counts roll-down along the curve.
      </p>
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
  custom?: boolean;
}

const CUSTOM_KEY = "gilt-monitor:rv-custom";

export function ScreensPanel({ switches, flies, gilts }: { switches: ScreenRow[]; flies: ScreenRow[]; gilts: { isin: string; name: string }[] }) {
  const [kind, setKind] = useState<"switches" | "flies">("switches");
  const [selId, setSelId] = useState<string | null>(null);
  // Your own switches / butterflies: leg ISINs saved in this browser, data fetched on load.
  const [customLegs, setCustomLegs] = useState<string[][]>([]);
  const [custom, setCustom] = useState<ScreenRow[]>([]);
  const [legs, setLegs] = useState<string[]>(["", "", ""]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of a saved preference
      if (Array.isArray(saved)) setCustomLegs(saved.filter((x) => Array.isArray(x) && (x.length === 2 || x.length === 3)));
    } catch {}
  }, []);
  const legsKey = customLegs.map((l) => l.join("-")).join("|");
  useEffect(() => {
    if (!legsKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear when the list is emptied
      setCustom([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      legsKey.split("|").map((id) =>
        fetch(`/api/gilts/combo?legs=${id.replace(/-/g, ",")}`)
          .then((r) => r.json())
          .then((d: ScreenRow & { error?: string }) => (d.error ? null : d))
          .catch(() => null),
      ),
    ).then((rows) => !cancelled && setCustom(rows.filter((r): r is ScreenRow => r != null)));
    return () => {
      cancelled = true;
    };
  }, [legsKey]);
  const saveLegs = (next: string[][]) => {
    setCustomLegs(next);
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
    } catch {}
  };

  const n = kind === "switches" ? 2 : 3;
  const add = () => {
    const chosen = legs.slice(0, n);
    if (chosen.some((x) => !x) || new Set(chosen).size !== n) return setError(`Pick ${n} different gilts.`);
    setError(null);
    const id = chosen.join("-");
    if (!customLegs.some((l) => l.join("-") === id)) saveLegs([...customLegs, chosen]);
    setSelId(id);
    setLegs(["", "", ""]);
  };

  const mine = custom.filter((c) => (kind === "switches" ? c.id.split("-").length === 2 : c.id.split("-").length === 3));
  const list = [...mine.map((c) => ({ ...c, custom: true })), ...(kind === "switches" ? switches : flies)];
  const sel = list.find((x) => x.id === selId) ?? list[0];
  const meanLine = (pts: Point[]) => {
    const xs = pts.slice(-252).map((p) => p[1]);
    const m = xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
    return pts.slice(-252).map(([d]) => [d, +m.toFixed(2)] as Point);
  };
  const legLabels = kind === "switches" ? ["Sell (shorter)", "Buy (longer)"] : ["Wing", "Belly", "Wing"];

  return (
    <Card
      title="Switch and butterfly screen"
      subtitle="Ranked by how unusual today's level is against the past year (z-score). Switch = longer yield − shorter yield; butterfly = 2 × belly − wings. Positive z: spread wide / belly cheap."
    >
      <div className="mb-2 flex w-fit rounded-md border border-line text-xs" data-export-ignore>
        {(["switches", "flies"] as const).map((k) => (
          <button
            key={k}
            onClick={() => {
              setKind(k);
              setSelId(null);
              setError(null);
            }}
            aria-pressed={kind === k}
            className={`px-2.5 py-1 ${kind === k ? "bg-surface-2 font-medium text-ink" : "text-ink-2"}`}
          >
            {k === "switches" ? "Switches" : "Butterflies"}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs" data-export-ignore>
        <span className="text-ink-2">Add your own:</span>
        {legLabels.map((label, i) => (
          <select
            key={i}
            value={legs[i]}
            onChange={(e) => setLegs((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
            aria-label={label}
            className="max-w-[11rem] rounded-md border border-line bg-surface px-2 py-1 text-ink"
          >
            <option value="">{label}…</option>
            {gilts.map((g) => (
              <option key={g.isin} value={g.isin}>
                {g.name}
              </option>
            ))}
          </select>
        ))}
        <button onClick={add} className="rounded-md bg-[color:var(--accent)] px-2.5 py-1 font-medium text-white">
          Add
        </button>
        {error && <span style={{ color: "var(--critical)" }}>{error}</span>}
      </div>
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-xs text-muted">
              <th className="py-1 text-left font-normal">{kind === "switches" ? "Switch" : "Butterfly"}</th>
              <th className="py-1 text-right font-normal">Level bp</th>
              <th className="py-1 text-right font-normal">1m chg</th>
              <th className="py-1 text-right font-normal">z (3m)</th>
              <th className="py-1 text-right font-normal">z (1y)</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody className="num">
            {list.slice(0, 40 + mine.length).map((r) => (
              <tr key={(r.custom ? "c:" : "") + r.id} onClick={() => setSelId(r.id)} className={`cursor-pointer border-t border-line ${sel?.id === r.id ? "bg-surface-2" : "hover:bg-surface-2/60"}`}>
                <td className="py-1 pr-2 text-ink">
                  {r.label}
                  {r.custom && <span className="ml-1.5 rounded bg-surface-2 px-1 text-[10px] text-ink-2">yours</span>}
                </td>
                <td className="py-1 text-right text-ink">{f(r.value, 1, true)}</td>
                <td className="py-1 text-right text-ink-2">{f(r.chg1m, 1, true)}</td>
                <td className="py-1 text-right" style={zStyle(r.z3m)}>
                  {f(r.z3m, 1, true)}
                </td>
                <td className="py-1 text-right" style={zStyle(r.z1y)}>
                  {f(r.z1y, 1, true)}
                </td>
                <td className="py-1 text-right">
                  {r.custom && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        saveLegs(customLegs.filter((l) => l.join("-") !== r.id));
                      }}
                      aria-label={`Remove ${r.label}`}
                      className="px-1 text-ink-2 hover:text-ink"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel && (
        <div className="mt-4">
          <h3 className="mb-1 text-xs font-medium text-ink-2">{sel.label}, bp</h3>
          <SeriesChart
            series={[
              { key: "s", name: "Spread", color: "var(--series-1)", points: sel.series },
              { key: "m", name: "1-year average", color: "var(--axis)", dashed: true, points: meanLine(sel.series) },
            ]}
            xKind="date"
            unit="bp"
            height={220}
            defaultRange="All"
          />
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        From daily closes in the gilt history (about a year so far). Yield spreads between bonds also drift as they age down the curve, so a z-score is a prompt to look, not a signal by itself. Your own switches and butterflies are saved in this browser.
      </p>
    </Card>
  );
}
