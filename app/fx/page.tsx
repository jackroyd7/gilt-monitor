import MarketsBoard, { TickerTape } from "@/components/MarketsBoard";
import { PageHeader } from "@/components/Tiles";

export const metadata = { title: "FX · Markets Monitor" };

export default function FXPage() {
  return (
    <>
      <PageHeader title="FX">
        FX spot rates from TradingView&apos;s embeddable widgets (some prices are delayed, depending on the exchange). Click a
        card for a chart, or use “Edit layout” to change the cards.
      </PageHeader>
      <TickerTape />
      <MarketsBoard groups={["FX spot"]} />
    </>
  );
}
