import Link from "next/link";
import MarketsBoard, { TickerTape } from "@/components/MarketsBoard";
import { PageHeader } from "@/components/Tiles";

export default function OverviewPage() {
  return (
    <>
      <PageHeader title="Overview">
        Markets at a glance. Gilts, curves and spreads are on the{" "}
        <Link href="/gilts" className="text-accent underline">
          Gilts
        </Link>{" "}
        tab.
      </PageHeader>
      <TickerTape />
      <MarketsBoard />
    </>
  );
}
