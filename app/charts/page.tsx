import ChartWorkbench from "@/components/ChartWorkbench";
import { PageHeader } from "@/components/Tiles";
import { normaliseTvSymbol } from "@/lib/tv-symbol";

export const metadata = { title: "Charts · Markets Monitor" };

export default async function ChartsPage({ searchParams }: PageProps<"/charts">) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const symbol = normaliseTvSymbol(first(params.tvwidgetsymbol), first(params.exchange));
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
