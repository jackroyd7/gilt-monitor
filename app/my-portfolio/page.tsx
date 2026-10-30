import TipsPortfolio from "@/components/TipsPortfolio";
import { PageHeader } from "@/components/Tiles";
import { prefsConfigured } from "@/lib/prefs-store";

export const metadata = { title: "Portfolio · Markets Monitor" };

export default function PortfolioPage() {
  return (
    <>
      <PageHeader title="Portfolio">
        Your holdings, valued in pounds and tracked against the FTSE 100. Add
        shares, ETFs or funds you own, or use the weekly tips section to review
        published share tips and turn the sensible ones into trades.
      </PageHeader>
      <TipsPortfolio shared={prefsConfigured()} />
    </>
  );
}
