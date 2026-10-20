import { connection } from "next/server";
import GiltMonitor, { type MonitorRow } from "@/components/GiltMonitor";
import LiveBar from "@/components/LiveBar";
import { PageHeader } from "@/components/Tiles";
import { giltRows } from "@/lib/analytics";
import { loadGiltHistory, loadMarketWithLive } from "@/lib/data";
import { nsValue, type NelsonSiegel } from "@/lib/fit";
import { giltSeries, londonNow, yieldChanges } from "@/lib/history";
import { liveInfo } from "@/lib/live";

function fitLine(fit: NelsonSiegel | null, from: number, to: number) {
  if (!fit || to <= from) return [];
  return Array.from({ length: 80 }, (_, i) => from + (i * (to - from)) / 79).map((t) => ({ t, y: nsValue(fit, t) }));
}

export default async function GiltsPage() {
  await connection(); // render per request so intraday prices are current
  const [{ curves, gilts, live }, hist] = await Promise.all([loadMarketWithLive(), loadGiltHistory()]);
  const { rows, fit, realFit, asOf } = giltRows(gilts, curves);
  const liveDate = live?.gilts.length ? londonNow(new Date(live.fetchedAt)).date : undefined;

  const monitor: MonitorRow[] = rows
    .filter((r): r is typeof r & { type: MonitorRow["type"] } => r.type === "conventional" || r.type === "index-linked")
    .map((r) => {
      const series = giltSeries(hist, r.isin);
      // The date the current yield belongs to: today if intraday, else its close date.
      const date = (r.live && liveDate) || r.priceDate || gilts?.priceDate || series[series.length - 1]?.[0] || asOf || "";
      const ch = yieldChanges(series, { date, yield: r.yield });
      return {
        isin: r.isin,
        name: r.name,
        type: r.type,
        maturity: r.maturity,
        years: r.years,
        cleanPrice: r.cleanPrice,
        yield: r.yield,
        yieldComputed: r.yieldComputed,
        oisSpread: r.oisSpread,
        richCheap: r.richCheap,
        bei: r.bei,
        modDuration: r.modDuration,
        live: r.live,
        ...ch,
      };
    });

  // Draw each fit only across the maturities it was fitted to.
  const span = (type: string, minYears: number) => {
    const ts = rows.filter((r) => r.type === type && r.yield != null && r.years > minYears).map((r) => r.years);
    return ts.length ? [Math.min(...ts), Math.max(...ts)] : [0, 0];
  };

  return (
    <>
      <PageHeader title={`Gilts${asOf ? ` · ${asOf}` : ""}`}>
        Every conventional and 3-month-lag index-linked gilt. Prices are intraday from giltsyield.com where available,
        otherwise the DMO close. Tick up to two gilts (or click points on the chart) to plot their yield or price
        history, or the yield spread between them.
      </PageHeader>
      <LiveBar live={liveInfo(live)} />
      <GiltMonitor
        rows={monitor}
        fits={{
          conventional: fitLine(fit, ...(span("conventional", 0.5) as [number, number])),
          "index-linked": fitLine(realFit, ...(span("index-linked", 1.5) as [number, number])),
        }}
      />
    </>
  );
}
