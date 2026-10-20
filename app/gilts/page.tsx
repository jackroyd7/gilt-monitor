import { GiltScatter } from "@/components/charts";
import GiltTable from "@/components/GiltTable";
import { Card, PageHeader } from "@/components/Tiles";
import { giltRows } from "@/lib/analytics";
import { loadMarket } from "@/lib/data";
import { nsValue } from "@/lib/fit";

export default async function GiltsPage() {
  const { curves, gilts } = await loadMarket();
  const { rows, fit, asOf } = giltRows(gilts, curves);
  const conv = rows.filter((r) => r.type === "conventional" && r.yield != null);
  const maxT = Math.max(1, ...conv.map((r) => r.years));
  const fitted = fit
    ? Array.from({ length: 80 }, (_, i) => 0.5 + (i * (maxT - 0.5)) / 79).map((t) => ({ t, y: nsValue(fit, t) }))
    : [];

  return (
    <>
      <PageHeader title={`Gilts in issue${asOf ? ` · ${asOf}` : ""}`}>
        DMO close-of-business prices. Each conventional gilt is compared with a Nelson-Siegel curve fitted to all
        conventionals over six months (index-linked gilts are in the table only). Positive “vs fit” means the gilt yields more than the curve (cheap).
      </PageHeader>
      <div className="grid gap-4">
        <Card
          title="Yield vs maturity"
          subtitle={fit ? `Fit RMSE ${(fit.rmse * 100).toFixed(1)}bp across ${conv.length} conventionals` : "Not enough priced gilts to fit a curve yet"}
        >
          <GiltScatter
            points={conv.map((r) => ({
              t: r.years,
              y: r.yield as number,
              name: r.name,
              extra: r.richCheap != null ? `${r.richCheap > 0 ? "+" : ""}${r.richCheap.toFixed(1)}bp vs fit` : undefined,
            }))}
            fitted={fitted}
          />
        </Card>
        <Card title="All gilts" subtitle="Click a column to sort">
          <GiltTable rows={rows} />
        </Card>
      </div>
    </>
  );
}
