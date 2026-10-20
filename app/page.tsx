import { connection } from "next/server";
import { SeriesChart, type Series } from "@/components/charts";
import LiveBar from "@/components/LiveBar";
import { Card, PageHeader, TileGrid } from "@/components/Tiles";
import {
  comparisonDates,
  curveOnDates,
  fittedMoves,
  headlineMetrics,
  metricSeries,
  rateMetric,
  spreadMetric,
  tile,
} from "@/lib/analytics";
import { latestDate } from "@/lib/curve";
import { loadMarketWithLive } from "@/lib/data";
import { liveInfo } from "@/lib/live";

export default async function Dashboard() {
  await connection();
  const { curves: c, gilts, dmoGilts, live } = await loadMarketWithLive();
  const moves = live?.gilts.length ? fittedMoves(gilts, dmoGilts, c, [2, 5, 10, 30]) : [];
  const tiles = headlineMetrics(c).map(tile);
  const asOf = latestDate(c.uk_nominal);

  const cmp = comparisonDates(c.uk_nominal, ["0", "1m"]);
  const curveSeries: Series[] = curveOnDates(c.uk_nominal, cmp.map((d) => d.date)).map((s, i) => ({
    key: cmp[i].key,
    name: `${cmp[i].label}${s.date ? ` (${s.date})` : ""}`,
    color: i === 0 ? "var(--series-1)" : "var(--series-2)",
    dashed: i > 0,
    points: s.points.map((p) => [p.t, p.v]),
  }));

  const tenYears: Series[] = [
    { key: "uk", name: "Gilt", color: "var(--series-1)", m: rateMetric(c, "uk_nominal", 10, "") },
    { key: "de", name: "Bund", color: "var(--series-2)", m: rateMetric(c, "de_bund", 10, "") },
    { key: "us", name: "UST", color: "var(--series-3)", m: rateMetric(c, "us_ust", 10, "") },
  ].map(({ m, ...s }) => ({ ...s, points: metricSeries(m) }));

  const oisSpreads: Series[] = [
    { key: "2", name: "2y", color: "var(--series-1)", t: 2 },
    { key: "5", name: "5y", color: "var(--series-2)", t: 5 },
    { key: "10", name: "10y", color: "var(--series-3)", t: 10 },
  ].map(({ t, ...s }) => ({ ...s, points: metricSeries(spreadMetric(c, ["uk_nominal", t], ["uk_ois", t], "")) }));

  return (
    <>
      <PageHeader title={`UK gilts${asOf ? ` · ${asOf}` : ""}`}>
        Headline levels and moves. Changes are in basis points; ▲ means yields (or the spread) rose.
      </PageHeader>
      {live && (
        <>
          <LiveBar live={liveInfo(live)} />
          {moves.some((m) => m.now != null) && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {moves.map((m) => (
                <div key={m.t} className="card p-3">
                  <div className="text-xs text-ink-2">Gilt {m.t}y · intraday fit</div>
                  <div className="mt-1 text-2xl font-semibold text-ink">{m.now == null ? "–" : `${m.now.toFixed(2)}%`}</div>
                  <div className="num mt-0.5 text-xs text-ink-2">
                    vs DMO close {m.chg == null ? "–" : `${m.chg > 0 ? "▲" : m.chg < 0 ? "▼" : ""}${Math.abs(m.chg).toFixed(1)}bp`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <TileGrid tiles={tiles} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Gilt nominal zero curve" subtitle="BoE fitted spot curve, latest vs a month earlier">
          <SeriesChart series={curveSeries} xKind="tenor" unit="pct" />
        </Card>
        <Card title="10-year yields" subtitle="Gilt vs Bund vs US Treasury">
          <SeriesChart series={tenYears} xKind="date" unit="pct" />
        </Card>
        <Card title="Gilt − SONIA OIS" subtitle="Matched-maturity spread on BoE zero curves; negative = gilts yield below swaps">
          <SeriesChart series={oisSpreads} xKind="date" unit="bp" />
        </Card>
        <Card title="Curve slopes" subtitle="Gilt nominal zero curve">
          <SeriesChart
            series={[
              { key: "2s10s", name: "2s10s", color: "var(--series-1)", points: metricSeries(spreadMetric(c, ["uk_nominal", 10], ["uk_nominal", 2], "")) },
              { key: "5s30s", name: "5s30s", color: "var(--series-2)", points: metricSeries(spreadMetric(c, ["uk_nominal", 30], ["uk_nominal", 5], "")) },
              { key: "10s30s", name: "10s30s", color: "var(--series-3)", points: metricSeries(spreadMetric(c, ["uk_nominal", 30], ["uk_nominal", 10], "")) },
            ]}
            xKind="date"
            unit="bp"
          />
        </Card>
      </div>
    </>
  );
}
