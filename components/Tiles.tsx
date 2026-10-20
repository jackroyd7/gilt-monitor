import type { Tile } from "@/lib/analytics";

function Sparkline({ points }: { points: [string, number][] }) {
  if (points.length < 2) return null;
  const w = 120;
  const h = 28;
  const ys = points.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - 2 - ((p[1] - lo) / span) * (h - 4)).toFixed(1)}`)
    .join("");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="1.5" />
    </svg>
  );
}

const fmtChange = (bp: number | null) =>
  bp == null ? "–" : `${bp > 0 ? "▲" : bp < 0 ? "▼" : ""}${Math.abs(bp).toFixed(1)}`;

export function TileGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.key} className="card p-3" title={t.date ? `as of ${t.date}` : "no data"}>
          <div className="text-xs text-ink-2">{t.label}</div>
          <div className="mt-1 text-2xl font-semibold text-ink">
            {t.value == null ? "–" : t.unit === "pct" ? `${t.value.toFixed(2)}%` : `${t.value.toFixed(0)}bp`}
          </div>
          <div className="num mt-0.5 flex gap-3 text-xs text-ink-2">
            <span>1d {fmtChange(t.chg1d)}</span>
            <span>1w {fmtChange(t.chg1w)}</span>
          </div>
          <div className="mt-2">
            <Sparkline points={t.spark} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-xl font-semibold text-ink">{title}</h1>
      {children && <p className="mt-1 max-w-3xl text-sm text-ink-2">{children}</p>}
    </div>
  );
}
