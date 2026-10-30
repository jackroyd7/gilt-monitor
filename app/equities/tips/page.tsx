import Link from "next/link";
import TipsPortfolio from "@/components/TipsPortfolio";
import { PageHeader } from "@/components/Tiles";
import { prefsConfigured } from "@/lib/prefs-store";

export const metadata = { title: "Tips portfolio · Markets Monitor" };

export default function TipsPage() {
  return (
    <>
      <div className="mb-3 text-xs">
        <Link href="/equities" className="text-accent">
          ← Equities
        </Link>
      </div>
      <PageHeader title="Tips portfolio">
        Add screenshots of each week&apos;s share tips, get a view on which are
        worth holding, and build a diversified portfolio with share counts,
        price targets and stop levels. Each week, new tips are weighed against
        what you already hold.
      </PageHeader>
      <TipsPortfolio shared={prefsConfigured()} />
    </>
  );
}
