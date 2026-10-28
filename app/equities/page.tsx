import MarketsBoard, { TickerTape } from "@/components/MarketsBoard";
import { PageHeader } from "@/components/Tiles";

export const metadata = { title: "Equities · Markets Monitor" };

export default function EquitiesPage() {
  return (
    <>
      <PageHeader title="Equities">
        Benchmark equity indices from TradingView&apos;s embeddable widgets (some prices are delayed, depending on the exchange). Click a
        card for a chart, or use “Edit layout” to change the cards.
      </PageHeader>
      <TickerTape />
      <MarketsBoard groups={["Equity indices"]} />
    </>
  );
}
