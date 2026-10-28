import { SeriesChart, type Series } from "@/components/charts";
import GiltTable from "@/components/GiltTable";
import { Card, PageHeader, TileGrid } from "@/components/Tiles";
import { giltRows, metricSeries, rateSA, spreadMetric, tile } from "@/lib/analytics";
import { latestDate } from "@/lib/curve";
import { connection } from "next/server";
import LiveBar from "@/components/LiveBar";
import { loadMarketWithLive } from "@/lib/data";
import { liveInfo } from "@/lib/live";

const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

export default async function SwapsPage() {
  await connection();
  const { curves: c, gilts, live } = await loadMarketWithLive();
  const ois = c.uk_ois;
  const maxOis = ois ? ois.tenors[ois.tenors.length - 1] : 0;
  const tenors = [2, 5, 10, 20, 30].filter((t) => t <= maxOis);

  const metrics = tenors.map((t) => spreadMetric(c, ["uk_nominal", t], ["uk_ois", t], `Gilt − OIS ${t}y`));
  const history: Series[] = metrics.map((m, i) => ({
    key: m.key,
    name: `${tenors[i]}y`,
    color: SLOTS[i],
    points: metricSeries(m),
  }));

  const last = latestDate(c.uk_nominal);
  const termStructure: Series[] = [
    {
      key: "curve",
      name: "Curve (zero vs zero)",
      color: "var(--series-1)",
      points: (c.uk_nominal?.tenors ?? [])
        .filter((t) => t >= 0.5 && t <= maxOis)
        .map((t) => {
          const g = rateSA(c.uk_nominal, last, t);
          const o = rateSA(ois, last, t);
          return [t, g != null && o != null ? (g - o) * 100 : NaN] as [number, number];
        })
        .filter((p) => isFinite(p[1])),
    },
  ];
  const { rows } = giltRows(gilts, c);
  const bonds = rows
    .filter((r) => r.oisSpread != null)
    .sort((a, b) => a.years - b.years);
  if (bonds.length) {
    termStructure.push({
      key: "bonds",
      name: "Individual gilts (yield vs OIS)",
      color: "var(--series-2)",
      dashed: true,
      points: bonds.map((r) => [r.years, r.oisSpread as number]),
    });
  }

  return (
    <>
      <PageHeader title="Gilts vs SONIA OIS">
        The asset-swap view: how much gilts yield over (or under) SONIA swaps at the same maturity. The curve
        line compares BoE zero curves on the same basis. The per-gilt line uses each bond’s redemption yield, so it
        is a proxy for, not a calculation of, a par-par asset swap spread.
        {ois ? ` BoE OIS data currently runs to ${maxOis}y.` : ""}
      </PageHeader>
      <LiveBar live={liveInfo(live)} />
      <TileGrid tiles={metrics.map(tile)} />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Spread by maturity" subtitle={`Latest${last ? ` · ${last}` : ""}`}>
          <SeriesChart series={termStructure} xKind="tenor" unit="bp" />
        </Card>
        <Card title="Spread history" subtitle="Gilt zero minus OIS zero">
          <SeriesChart series={history} xKind="date" unit="bp" />
        </Card>
      </div>
      <div className="mt-4">
        <Card title="Per-gilt spreads" subtitle="Sort by “vs OIS” to find the gilts trading cheapest to swaps">
          <GiltTable rows={rows} />
        </Card>
      </div>
    </>
  );
}
