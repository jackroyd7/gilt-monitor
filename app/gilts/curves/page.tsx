import { ToggleSeriesChart, type Series } from "@/components/charts";
import { Card, PageHeader } from "@/components/Tiles";
import { COMPARE_OFFSETS, comparisonDates, curveOnDates, rateSA } from "@/lib/analytics";
import { addDays, dateOnOrBefore, latestDate } from "@/lib/curve";
import { loadMarket } from "@/lib/data";
import type { CurveId, CurveSet } from "@/lib/types";

const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
const KEY_TENORS = [1, 2, 3, 5, 7, 10, 15, 20, 30, 40];

function comparisonSeries(set: CurveSet | undefined, transform?: (t: number, v: number, date: string) => number | null): Series[] {
  const cmp = comparisonDates(set, COMPARE_OFFSETS.map((o) => o.key));
  return curveOnDates(set, cmp.map((d) => d.date)).map((s, i) => ({
    key: cmp[i].key,
    name: `${cmp[i].label}${s.date ? ` · ${s.date}` : ""}`,
    color: SLOTS[i],
    dashed: i > 0,
    points: s.points
      .map((p) => [p.t, transform && s.date ? transform(p.t, p.v, s.date) : p.v] as [number, number | null])
      .filter((p): p is [number, number] => p[1] != null),
  }));
}

function ChangeTable({ set }: { set: CurveSet | undefined }) {
  const last = latestDate(set);
  if (!set || !last) return null;
  const at = (days: number) => (days ? dateOnOrBefore(set, addDays(last, -days)) : last);
  const tenors = KEY_TENORS.filter((t) => t >= set.tenors[0] && t <= set.tenors[set.tenors.length - 1]);
  const ago = [
    { label: "1d", d: Object.keys(set.rows).sort().slice(-2)[0] },
    { label: "1w", d: at(7) },
    { label: "1m", d: at(30) },
    { label: "1y", d: at(365) },
  ];
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="num w-full text-xs">
        <thead className="text-muted">
          <tr>
            <th className="py-1 text-left font-normal">Tenor</th>
            {tenors.map((t) => (
              <th key={t} className="py-1 text-right font-normal">{t}y</th>
            ))}
          </tr>
        </thead>
        <tbody className="text-ink-2">
          <tr className="border-t border-line">
            <td className="py-1 text-ink">Level %</td>
            {tenors.map((t) => (
              <td key={t} className="py-1 text-right text-ink">{rateSA(set, last, t)?.toFixed(2) ?? "–"}</td>
            ))}
          </tr>
          {ago.map(({ label, d }) => (
            <tr key={label} className="border-t border-line">
              <td className="py-1">Δ{label} bp</td>
              {tenors.map((t) => {
                const a = rateSA(set, last, t);
                const b = rateSA(set, d, t);
                return (
                  <td key={t} className="py-1 text-right">
                    {a != null && b != null && d !== last ? ((a - b) * 100).toFixed(1) : "–"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CURVES: { id: CurveId; title: string; subtitle: string }[] = [
  { id: "uk_nominal", title: "Nominal gilt zero curve", subtitle: "BoE fitted spot curve" },
  { id: "uk_real", title: "Real (index-linked) zero curve", subtitle: "BoE fitted real spot curve, RPI-linked gilts" },
  { id: "uk_inflation", title: "Implied RPI inflation", subtitle: "BoE nominal minus real, inflation-risk premia included" },
  { id: "uk_ois", title: "SONIA OIS zero curve", subtitle: "BoE fitted OIS spot curve" },
];

export default async function CurvesPage() {
  const { curves: c } = await loadMarket();

  // Gilt minus OIS by tenor, on each comparison date.
  const oisSpread = comparisonSeries(c.uk_nominal, (t, v, date) => {
    const o = rateSA(c.uk_ois, date, t);
    return o == null ? null : (v - o) * 100;
  });

  return (
    <>
      <PageHeader title="Curves">
        Toggle comparison dates on each chart. Rates are shown semi-annually compounded. Tables give level and
        changes at key tenors.
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        {CURVES.map((k) => (
          <Card key={k.id} title={k.title} subtitle={k.subtitle}>
            <ToggleSeriesChart options={comparisonSeries(c[k.id])} initial={["0", "1m"]} xKind="tenor" unit="pct" />
            <ChangeTable set={c[k.id]} />
          </Card>
        ))}
        <Card title="Gilt − SONIA OIS by tenor" subtitle="Matched-maturity swap spread curve (bp)">
          <ToggleSeriesChart options={oisSpread} initial={["0", "3m"]} xKind="tenor" unit="bp" />
        </Card>
      </div>
    </>
  );
}
