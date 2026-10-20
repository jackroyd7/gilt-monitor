import { loadMarket } from "@/lib/data";

const NAMES: Record<string, string> = {
  boe: "Bank of England curves",
  bundesbank: "Bundesbank Bund curve",
  ust: "US Treasury curve",
  dmo: "DMO gilt prices",
};

export default async function SourceStatus() {
  const { status } = await loadMarket();
  if (!status) {
    return (
      <p className="text-xs text-muted">
        No data yet. Run the “Update market data” GitHub Action (or <code>npm run fetch-data</code>).
      </p>
    );
  }
  return (
    <div className="space-y-2 text-xs text-ink-2">
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {Object.entries(status.sources).map(([id, s]) => (
          <span key={id} title={s.message}>
            <span style={{ color: s.ok ? "var(--good)" : "var(--critical)" }}>{s.ok ? "●" : "▲"}</span>{" "}
            {NAMES[id] ?? id}: {s.ok ? `to ${s.latestDate ?? "?"}` : "failed (hover for detail)"}
          </span>
        ))}
        <span className="text-muted">Checked {status.updatedAt.slice(0, 16).replace("T", " ")} UTC</span>
      </div>
      <p className="text-muted">
        Curves are end-of-day; gilt prices are intraday from giltsyield.com when connected. Cross-market figures convert each source to semi-annual compounding; BoE and Bundesbank
        are fitted zero curves, US Treasury is a par curve. Gilt − OIS is an asset-swap proxy, not a par-par
        asset swap spread.
      </p>
    </div>
  );
}

export async function DemoBanner() {
  const { status } = await loadMarket();
  if (!status?.demo) return null;
  return (
    <p className="mb-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-ink">
      ⚠ Demo data: synthetic numbers for layout testing, not market prices.
    </p>
  );
}
