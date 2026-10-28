import MarketsBoard, { TickerTape } from "@/components/MarketsBoard";
import { PageHeader } from "@/components/Tiles";

export const metadata = { title: "Commodities · Markets Monitor" };

export default function CommoditiesPage() {
  return (
    <>
      <PageHeader title="Commodities">
        Commodity futures from TradingView&apos;s embeddable widgets (some prices are delayed, depending on the exchange). Click a
        card for a chart, or use “Edit layout” to change the cards.
      </PageHeader>
      <TickerTape />
      <MarketsBoard groups={["Commodities"]} />
    </>
  );
}
