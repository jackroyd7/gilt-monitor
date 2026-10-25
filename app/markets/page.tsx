import MarketsBoard from "@/components/MarketsBoard";
import { PageHeader } from "@/components/Tiles";

export const metadata = { title: "Markets · Gilt Monitor" };

export default async function MarketsPage({ searchParams }: PageProps<"/markets">) {
  const params = await searchParams;
  const raw = params.tvwidgetsymbol;
  const symbol = (Array.isArray(raw) ? raw[0] : raw)?.trim() || undefined;
  return (
    <>
      <PageHeader title="Markets">
        Benchmark equity indices, FX spot rates and commodities from TradingView&apos;s embeddable widgets (some prices
        are delayed, depending on the exchange). Click any instrument for its chart. Symbols are set in{" "}
        <code>config/markets.ts</code>.
      </PageHeader>
      <MarketsBoard initialSymbol={symbol} />
    </>
  );
}
