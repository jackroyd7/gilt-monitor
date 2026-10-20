import { SeriesChart, type Series } from "@/components/charts";
import { Card, PageHeader, TileGrid } from "@/components/Tiles";
import { curveOnDates, metricSeries, rateSA, spreadMetric, tile } from "@/lib/analytics";
import { dateOnOrBefore, latestDate } from "@/lib/curve";
import { loadMarket } from "@/lib/data";
import type { CurveId } from "@/lib/types";

// Colour follows the market everywhere on this page.
const MARKETS: { id: CurveId; name: string; color: string }[] = [
  { id: "uk_nominal", name: "UK gilt", color: "var(--series-1)" },
  { id: "de_bund", name: "German Bund", color: "var(--series-2)" },
  { id: "us_ust", name: "US Treasury", color: "var(--series-3)" },
];

export default async function CrossMarketPage() {
  const { curves: c } = await loadMarket();
  const ukLast = latestDate(c.uk_nominal);

  const latestCurves: Series[] = MARKETS.map((m) => {
    const d = latestDate(c[m.id]);
    return {
      key: m.id,
      name: `${m.name}${d ? ` · ${d}` : ""}`,
      color: m.color,
      points: (curveOnDates(c[m.id], [d], 30)[0]?.points ?? []).filter((p) => p.t >= 1).map((p) => [p.t, p.v]),
    };
  });

  const spreadCurve = (other: CurveId): [number, number][] => {
    const d = ukLast && c[other] ? dateOnOrBefore(c[other]!, ukLast) : undefined;
    return [1, 2, 3, 5, 7, 10, 15, 20, 25, 30].flatMap((t) => {
      const a = rateSA(c.uk_nominal, ukLast, t);
      const b = rateSA(c[other], d, t);
      return a != null && b != null ? [[t, (a - b) * 100] as [number, number]] : [];
    });
  };

  const spreads = [2, 10, 30].flatMap((t) => [
    spreadMetric(c, ["uk_nominal", t], ["de_bund", t], `Gilt − Bund ${t}y`),
    spreadMetric(c, ["uk_nominal", t], ["us_ust", t], `Gilt − UST ${t}y`),
  ]);

  const history = (t: number): Series[] =>
    MARKETS.map((m) => ({
      key: m.id,
      name: m.name,
      color: m.color,
      points: metricSeries({ key: m.id, label: m.name, unit: "pct", base: c[m.id], at: (d) => rateSA(c[m.id], d, t) }),
    }));

  return (
    <>
      <PageHeader title="Cross-market">
        Gilts against Bunds and US Treasuries. All rates are converted to semi-annual compounding. Bund and gilt
        curves are fitted zero curves; the Treasury curve is a par curve, which reads a little lower than a zero
        curve when the curve slopes upward.
      </PageHeader>
      <TileGrid tiles={spreads.map(tile)} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Latest curves" subtitle="1–30 years">
          <SeriesChart series={latestCurves} xKind="tenor" unit="pct" />
        </Card>
        <Card title="Gilt spread by maturity" subtitle={`UK minus other market${ukLast ? ` · ${ukLast}` : ""}`}>
          <SeriesChart
            series={[
              { key: "de", name: "vs Bund", color: "var(--series-2)", points: spreadCurve("de_bund") },
              { key: "us", name: "vs UST", color: "var(--series-3)", points: spreadCurve("us_ust") },
            ]}
            xKind="tenor"
            unit="bp"
          />
        </Card>
        <Card title="2-year yields">
          <SeriesChart series={history(2)} xKind="date" unit="pct" />
        </Card>
        <Card title="10-year yields">
          <SeriesChart series={history(10)} xKind="date" unit="pct" />
        </Card>
        <Card title="10-year spreads" subtitle="Gilt minus Bund / UST">
          <SeriesChart
            series={[
              { key: "de", name: "vs Bund", color: "var(--series-2)", points: metricSeries(spreads[2]) },
              { key: "us", name: "vs UST", color: "var(--series-3)", points: metricSeries(spreads[3]) },
            ]}
            xKind="date"
            unit="bp"
          />
        </Card>
        <Card title="30-year yields">
          <SeriesChart series={history(30)} xKind="date" unit="pct" />
        </Card>
      </div>
    </>
  );
}
