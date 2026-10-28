// Rows of % moves as small bars centred on zero (green up, red down), in optional groups.

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const colour = (v: number) => (v >= 0 ? "var(--down)" : "var(--up)");

export interface BarRow {
  label: string;
  change: number;
  detail?: string;
}

export default function BarRows({ groups }: { groups: { title?: string; rows: BarRow[] }[] }) {
  const all = groups.flatMap((g) => g.rows);
  if (!all.length) return <p className="text-sm text-muted">No prices yet: they arrive with the next run of the data job.</p>;
  const max = Math.max(...all.map((r) => Math.abs(r.change)), 0.5);
  return (
    <div className="space-y-3">
      {groups.map((g, gi) => (
        <table key={gi} className="w-full text-sm">
          {g.title && (
            <thead>
              <tr>
                <th colSpan={3} className="pb-1 text-left text-xs font-medium text-ink-2">
                  {g.title}
                </th>
              </tr>
            </thead>
          )}
          <tbody className="num">
            {[...g.rows]
              .sort((a, b) => b.change - a.change)
              .map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <td className="w-2/5 py-1.5 text-ink">
                    {r.label}
                    {r.detail && <span className="ml-1.5 text-[11px] text-muted">{r.detail}</span>}
                  </td>
                  <td className="py-1.5">
                    <div className="relative h-2.5">
                      <div className="absolute inset-y-0 left-1/2 w-px bg-[color:var(--axis)]" />
                      <div
                        className="absolute inset-y-0 rounded-sm"
                        style={{
                          background: colour(r.change),
                          width: `${(Math.abs(r.change) / max) * 50}%`,
                          left: r.change >= 0 ? "50%" : `${50 - (Math.abs(r.change) / max) * 50}%`,
                        }}
                      />
                    </div>
                  </td>
                  <td className="w-20 py-1.5 text-right font-medium" style={{ color: colour(r.change) }}>
                    {pct(r.change)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}
