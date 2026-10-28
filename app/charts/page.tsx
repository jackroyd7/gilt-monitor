import ChartWorkbench from "@/components/ChartWorkbench";
import { PageHeader } from "@/components/Tiles";

export const metadata = { title: "Charts · Markets Monitor" };

export default async function ChartsPage({ searchParams }: PageProps<"/charts">) {
  const raw = (await searchParams).tvwidgetsymbol;
  const symbol = (Array.isArray(raw) ? raw[0] : raw)?.trim() || undefined;
  return (
    <>
      <PageHeader title="Charts">
        Search for an index, stock, currency pair, commodity or bond yield. Line chart by default; switch to candles,
        change interval or add indicators from the chart toolbar. Gilt yield histories are on Gilts → Gilts.
      </PageHeader>
      <ChartWorkbench symbol={symbol} />
    </>
  );
}
