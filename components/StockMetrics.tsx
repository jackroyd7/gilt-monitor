import {
  ccySign,
  fmtCount,
  fmtMoney,
  median,
  type MetricKey,
  type StockMetrics,
} from "@/lib/stock-metrics";

type Row = {
  label: string;
  value: string | null;
  peer?: string | null;
  hint?: string;
};

const x = (v?: number) => (v == null ? null : `${v.toFixed(1)}x`);
const pct = (v?: number, dp = 1) =>
  v == null ? null : `${(v * 100).toFixed(dp)}%`;

// Prices are in the quote currency: pence for most London listings.
const price = (v: number | undefined, ccy?: string) => {
  if (v == null) return null;
  if (ccy === "GBp") return `${v.toFixed(v >= 1000 ? 0 : 1)}p`;
  return `${ccySign(ccy)}${v.toFixed(v >= 10_000 ? 0 : 2)}`;
};

function Section({
  title,
  rows,
  peerLabel,
}: {
  title: string;
  rows: Row[];
  peerLabel?: string;
}) {
  const shown = rows.filter((r) => r.value != null);
  if (!shown.length) return null;
  const peers = peerLabel && shown.some((r) => r.peer);
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">
        {title}
      </h3>
      <table className="num w-full text-sm">
        {peers && (
          <thead>
            <tr className="text-[11px] text-muted">
              <th />
              <th className="text-right font-normal" />
              <th className="pl-3 text-right font-normal">{peerLabel}</th>
            </tr>
          </thead>
        )}
        <tbody>
          {shown.map((r) => (
            <tr key={r.label} className="border-t border-line first:border-0">
              <td className="py-1 text-ink-2" title={r.hint}>
                {r.label}
                {r.hint && (
                  <span className="ml-1 cursor-help text-muted">ⓘ</span>
                )}
              </td>
              <td className="py-1 text-right text-ink">{r.value}</td>
              {peers && (
                <td className="py-1 pl-3 text-right text-muted">
                  {r.peer ?? "–"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Valuation, pricing and fundamentals for one stock, with the median of its market for comparison. */
export default function StockMetricsPanel({
  m,
  peers,
  peerLabel,
}: {
  m: StockMetrics | undefined;
  peers: StockMetrics[];
  peerLabel: string;
}) {
  if (!m) {
    return (
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-ink">Key metrics</h2>
        <p className="mt-1 text-sm text-muted">
          No metrics for this stock yet. They&apos;re refreshed once a day by
          the data job.
        </p>
      </section>
    );
  }
  const med = (k: MetricKey) => median(peers.map((p) => p[k]));
  const fc = m.financialCurrency ?? (m.currency === "GBp" ? "GBP" : m.currency);
  const cap = m.currency === "GBp" ? "GBP" : m.currency;
  const upside =
    m.targetMean != null && m.price ? m.targetMean / m.price - 1 : undefined;
  const range52 =
    m.high52 != null && m.low52 != null && m.price != null && m.high52 > m.low52
      ? (m.price - m.low52) / (m.high52 - m.low52)
      : undefined;
  const netCash =
    m.totalCash != null && m.totalDebt != null
      ? m.totalCash - m.totalDebt
      : undefined;

  const valuation: Row[] = [
    {
      label: "Market cap",
      value: m.marketCap != null ? fmtMoney(m.marketCap, cap) : null,
    },
    {
      label: "Enterprise value",
      value:
        m.enterpriseValue != null ? fmtMoney(m.enterpriseValue, cap) : null,
      hint: "Market cap plus net debt",
    },
    {
      label: "P/E (trailing)",
      value: x(m.trailingPE),
      peer: x(med("trailingPE")),
      hint: "Price over the last 12 months' earnings per share",
    },
    {
      label: "P/E (forward)",
      value: x(m.forwardPE),
      peer: x(med("forwardPE")),
      hint: "Price over analysts' forecast earnings for the next year",
    },
    {
      label: "PEG",
      value: m.pegRatio != null ? m.pegRatio.toFixed(2) : null,
      hint: "P/E divided by expected earnings growth; around 1 is often read as fair",
    },
    {
      label: "Price / book",
      value: x(m.priceToBook),
      peer: x(med("priceToBook")),
    },
    {
      label: "Price / sales",
      value: x(m.priceToSales),
      peer: x(med("priceToSales")),
    },
    {
      label: "EV / EBITDA",
      value: x(m.evToEbitda),
      peer: x(med("evToEbitda")),
    },
    {
      label: "EV / revenue",
      value: x(m.evToRevenue),
      peer: x(med("evToRevenue")),
    },
    {
      label: "Dividend yield",
      value: pct(m.dividendYield, 2),
      peer: pct(med("dividendYield"), 2),
    },
    {
      label: "Payout ratio",
      value: pct(m.payoutRatio, 0),
      hint: "Share of earnings paid out as dividends",
    },
  ];
  const pricing: Row[] = [
    { label: "Price", value: price(m.price, m.currency) },
    {
      label: "52-week range",
      value:
        m.low52 != null && m.high52 != null
          ? `${price(m.low52, m.currency)} – ${price(m.high52, m.currency)}`
          : null,
    },
    {
      label: "Position in range",
      value: range52 != null ? `${Math.round(range52 * 100)}%` : null,
      hint: "0% = at the 52-week low, 100% = at the high",
    },
    { label: "50-day average", value: price(m.avg50, m.currency) },
    { label: "200-day average", value: price(m.avg200, m.currency) },
    {
      label: "Beta",
      value: m.beta != null ? m.beta.toFixed(2) : null,
      hint: "Sensitivity to the overall market: 1 moves with it, above 1 moves more",
    },
    {
      label: "Avg daily volume",
      value: m.avgVolume != null ? fmtCount(m.avgVolume) : null,
    },
    {
      label: "Shares outstanding",
      value: m.sharesOutstanding != null ? fmtCount(m.sharesOutstanding) : null,
    },
    {
      label: "Short interest",
      value: pct(m.shortPctFloat),
      hint: "Shares sold short as a share of the free float (US listings)",
    },
    {
      label: "Analyst target",
      value:
        m.targetMean != null
          ? `${price(m.targetMean, m.currency)}${upside != null ? ` (${upside >= 0 ? "+" : ""}${(upside * 100).toFixed(0)}%)` : ""}`
          : null,
      hint: m.analysts
        ? `Mean of ${m.analysts} analysts' price targets`
        : "Mean of analysts' price targets",
    },
    {
      label: "Consensus",
      value: m.recommendation
        ? m.recommendation.replace(/^\w/, (c) => c.toUpperCase())
        : null,
    },
  ];
  const fundamentals: Row[] = [
    {
      label: "Profit margin",
      value: pct(m.profitMargin),
      peer: pct(med("profitMargin")),
    },
    {
      label: "Operating margin",
      value: pct(m.operatingMargin),
      peer: pct(med("operatingMargin")),
    },
    {
      label: "Return on equity",
      value: pct(m.returnOnEquity),
      peer: pct(med("returnOnEquity")),
    },
    {
      label: "Revenue growth",
      value: pct(m.revenueGrowth),
      hint: "Latest quarter on the same quarter a year earlier",
    },
    {
      label: "Earnings growth",
      value: pct(m.earningsGrowth),
      hint: "Latest quarter on the same quarter a year earlier",
    },
    {
      label: "Debt / equity",
      value:
        m.debtToEquity != null ? `${(m.debtToEquity / 100).toFixed(2)}x` : null,
    },
    {
      label: "Net cash",
      value: netCash != null ? fmtMoney(netCash, fc) : null,
      hint: "Cash minus total debt; negative means net debt",
    },
    {
      label: "Free cash flow",
      value: m.freeCashflow != null ? fmtMoney(m.freeCashflow, fc) : null,
      hint: "Last 12 months",
    },
  ];
  const asOf = m.asOf.slice(0, 10).split("-").reverse().join("/");
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Key metrics</h2>
        <span className="text-xs text-muted">Yahoo Finance, as of {asOf}</span>
      </div>
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
        <Section title="Valuation" rows={valuation} peerLabel={peerLabel} />
        <Section title="Price" rows={pricing} />
        <Section
          title="Fundamentals"
          rows={fundamentals}
          peerLabel={peerLabel}
        />
      </div>
    </section>
  );
}
