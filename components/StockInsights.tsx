import Link from "next/link";
import type {
  CompanyProfile,
  EarningsResult,
  Recommendation,
} from "@/lib/finnhub";
import { rangeStats } from "@/lib/price-tools";
import type { StockHistory } from "@/lib/stock-history";
import {
  ccySign,
  fmtCount,
  fmtMoney,
  type StockMetrics,
} from "@/lib/stock-metrics";
import type { StockQuote } from "@/lib/stocks";

type Pt = [string, number];

const pctTone = (v: number) => ({
  color: v >= 0 ? "var(--down)" : "var(--up)",
});
const Pct = ({ v, dp = 2 }: { v: number | null | undefined; dp?: number }) =>
  v == null ? (
    <span className="text-muted">–</span>
  ) : (
    <span style={pctTone(v)}>{`${v > 0 ? "+" : ""}${v.toFixed(dp)}%`}</span>
  );

/** Prices in the quote currency: pence for London listings. */
export function fmtPrice(v: number, currency?: string) {
  const dp = v >= 10_000 ? 0 : 2;
  return currency === "GBp" || currency === "GBX"
    ? `${v.toFixed(dp)}p`
    : `${ccySign(currency)}${v.toFixed(dp)}`;
}

const valueOn = (pts: Pt[], from: string) => {
  let base: number | undefined;
  for (const [d, v] of pts) {
    if (d > from) break;
    base = v;
  }
  return base;
};
const back = (last: string, days: number) =>
  last
    ? new Date(Date.parse(last) - days * 86_400_000).toISOString().slice(0, 10)
    : "9999";

/** Price, the day's trading, returns over standard periods, volume and volatility. */
export function TradingCard({
  history,
  quote,
}: {
  history: StockHistory | null;
  quote?: StockQuote;
}) {
  const pts = history?.points ?? [];
  const price = history?.price ?? quote?.price;
  const currency = history?.currency ?? quote?.currency;
  if (price == null) {
    return (
      <section className="card p-4">
        <p className="text-sm text-muted">
          No price available for this stock right now.
        </p>
      </section>
    );
  }
  const prev =
    history?.prevClose ??
    quote?.prevClose ??
    (pts.length > 1 ? pts[pts.length - 2][1] : undefined);
  const day = prev ? (price / prev - 1) * 100 : quote?.change;
  const last = pts.at(-1)?.[0] ?? "";
  const ret = (from: string | undefined) => {
    const b = from ? valueOn(pts, from) : undefined;
    return b && (from ?? "") >= (pts[0]?.[0] ?? "")
      ? (price / b - 1) * 100
      : null;
  };
  const periods: [string, string][] = [
    ["1 week", back(last, 7)],
    ["1 month", back(last, 31)],
    ["3 months", back(last, 92)],
    ["6 months", back(last, 183)],
    ["Year to date", `${Number(last.slice(0, 4)) - 1}-12-31`],
    ["1 year", back(last, 366)],
    ["3 years", back(last, 1096)],
    ["5 years", back(last, 1820)],
  ];
  const vols = (history?.volumes ?? [])
    .slice(-63)
    .filter((v): v is number => v != null && v > 0);
  const avgVol = vols.length
    ? vols.reduce((a, b) => a + b, 0) / vols.length
    : undefined;
  const year = pts.filter(([d]) => d >= back(last, 366));
  const hi =
    history?.high52 ??
    (year.length ? Math.max(...year.map((p) => p[1])) : undefined);
  const lo =
    history?.low52 ??
    (year.length ? Math.min(...year.map((p) => p[1])) : undefined);
  const pos =
    hi != null && lo != null && hi > lo
      ? Math.min(1, Math.max(0, (price - lo) / (hi - lo)))
      : undefined;
  const vol30 = rangeStats(pts.slice(-22))?.vol;
  const vol1y = rangeStats(year)?.vol;
  const dd1y = rangeStats(year)?.maxDrawdown;
  const fromHigh = hi ? (price / hi - 1) * 100 : undefined;

  const cell = (label: string, value: React.ReactNode, title?: string) => (
    <div title={title}>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="num text-sm text-ink">{value}</div>
    </div>
  );

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="num text-3xl font-semibold text-ink">
          {fmtPrice(price, currency)}
        </span>
        <span className="num text-lg">
          <Pct v={day} />
        </span>
        {prev != null && (
          <span className="num text-sm text-ink-2">{`${price - prev >= 0 ? "+" : ""}${fmtPrice(price - prev, currency)}`}</span>
        )}
        {history?.exchange && (
          <span className="text-xs text-muted">
            {history.exchange} · delayed
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {cell("Previous close", prev != null ? fmtPrice(prev, currency) : "–")}
        {cell(
          "Day range",
          history?.dayLow != null && history.dayHigh != null
            ? `${fmtPrice(history.dayLow, currency)} – ${fmtPrice(history.dayHigh, currency)}`
            : "–",
        )}
        {cell(
          "Volume",
          history?.dayVolume != null ? (
            <>
              {fmtCount(history.dayVolume)}
              {avgVol ? (
                <span className="ml-1 text-xs text-muted">
                  ({Math.round((history.dayVolume / avgVol) * 100)}% of avg)
                </span>
              ) : null}
            </>
          ) : (
            "–"
          ),
        )}
        {cell("Avg volume (3m)", avgVol ? fmtCount(avgVol) : "–")}
      </div>

      {hi != null && lo != null && (
        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-muted">
            <span>52-week low {fmtPrice(lo, currency)}</span>
            <span>
              {fromHigh != null && fromHigh < -0.05 ? (
                <span className="mr-2">{fromHigh.toFixed(1)}% from high</span>
              ) : null}
              high {fmtPrice(hi, currency)}
            </span>
          </div>
          <div className="relative mt-1 h-1.5 rounded-full bg-surface-2">
            {pos != null && (
              <div
                className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded bg-[color:var(--accent)]"
                style={{ left: `${pos * 100}%` }}
              />
            )}
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-4 gap-x-4 gap-y-2 border-t border-line pt-3 sm:grid-cols-8">
        {periods.map(([label, from]) => (
          <div key={label}>
            <div className="text-[11px] text-muted">{label}</div>
            <div className="num text-sm">
              <Pct v={ret(from)} dp={1} />
            </div>
          </div>
        ))}
      </div>
      <div className="num mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-2">
        <span title="Annualised standard deviation of daily returns over the last month">
          Volatility 1m {vol30 != null ? `${vol30.toFixed(1)}%` : "–"}
        </span>
        <span title="Annualised standard deviation of daily returns over the last year">
          Volatility 1y {vol1y != null ? `${vol1y.toFixed(1)}%` : "–"}
        </span>
        <span title="Largest peak-to-trough fall in the last year">
          Max drawdown 1y {dd1y != null ? `${dd1y.toFixed(1)}%` : "–"}
        </span>
      </div>
    </section>
  );
}

type Row = { label: string; value: string | null; hint?: string };
const x = (v?: number) => (v == null ? null : `${v.toFixed(1)}x`);
const pct = (v?: number, dp = 1) =>
  v == null ? null : `${(v * 100).toFixed(dp)}%`;

function Rows({ title, rows }: { title: string; rows: Row[] }) {
  const shown = rows.filter((r) => r.value != null);
  if (!shown.length) return null;
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">
        {title}
      </h3>
      <table className="num w-full text-sm">
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Valuation and fundamentals from Finnhub's basic financials. */
export function MetricsCard({
  m,
  profile,
  currency,
  hasKey,
  source = "Finnhub",
  missing,
}: {
  m: StockMetrics | null;
  profile: CompanyProfile | null;
  /** Currency of market cap and enterprise value. */
  currency?: string;
  hasKey: boolean;
  source?: string;
  /** Why there are no figures, when there aren't. */
  missing?: string;
}) {
  const cur = currency === "GBp" || currency === "GBX" ? "GBP" : currency;
  const cap = m?.marketCap ?? profile?.marketCap;
  if (!m && cap == null) {
    return (
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-ink">Key metrics</h2>
        <p className="mt-1 text-sm text-muted">
          {hasKey
            ? `No valuation figures available: ${missing ?? "none of our sources cover this listing"}.`
            : "Set FINNHUB_API_KEY in Vercel to show valuation and fundamentals."}
        </p>
      </section>
    );
  }
  const valuation: Row[] = [
    { label: "Market cap", value: cap != null ? fmtMoney(cap, cur) : null },
    {
      label: "Enterprise value",
      value:
        m?.enterpriseValue != null ? fmtMoney(m.enterpriseValue, cur) : null,
      hint: "Market cap plus net debt",
    },
    {
      label: "P/E (trailing)",
      value: x(m?.trailingPE),
      hint: "Price over the last 12 months' earnings per share",
    },
    {
      label: "P/E (forward)",
      value: x(m?.forwardPE),
      hint: "Price over forecast earnings for the next year",
    },
    {
      label: "PEG",
      value: m?.pegRatio != null ? m.pegRatio.toFixed(2) : null,
      hint: "P/E divided by earnings growth; around 1 is often read as fair",
    },
    { label: "Price / book", value: x(m?.priceToBook) },
    { label: "Price / sales", value: x(m?.priceToSales) },
    { label: "EV / EBITDA", value: x(m?.evToEbitda) },
    { label: "EV / revenue", value: x(m?.evToRevenue) },
    { label: "Dividend yield", value: pct(m?.dividendYield, 2) },
    {
      label: "Payout ratio",
      value: pct(m?.payoutRatio, 0),
      hint: "Share of earnings paid out as dividends",
    },
  ];
  const fundamentals: Row[] = [
    {
      label: "EPS (TTM)",
      value: m?.eps != null ? m.eps.toFixed(2) : null,
      hint: "Earnings per share over the last 12 months, in the reporting currency",
    },
    { label: "Gross margin", value: pct(m?.grossMargin) },
    { label: "Operating margin", value: pct(m?.operatingMargin) },
    { label: "Net margin", value: pct(m?.profitMargin) },
    { label: "Return on equity", value: pct(m?.returnOnEquity) },
    {
      label: "Revenue growth",
      value: pct(m?.revenueGrowth),
      hint: "Last 12 months on the 12 months before",
    },
    {
      label: "EPS growth",
      value: pct(m?.earningsGrowth),
      hint: "Last 12 months on the 12 months before",
    },
    { label: "Debt / equity", value: x(m?.debtToEquity) },
    {
      label: "Current ratio",
      value: x(m?.currentRatio),
      hint: "Current assets over current liabilities",
    },
    {
      label: "Beta",
      value: m?.beta != null ? m.beta.toFixed(2) : null,
      hint: "Sensitivity to the overall market: 1 moves with it, above 1 moves more",
    },
    {
      label: "Shares outstanding",
      value: profile?.shares != null ? fmtCount(profile.shares) : null,
    },
  ];
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Key metrics</h2>
        <span className="text-xs text-muted">
          {source}, latest reported figures
        </span>
      </div>
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        <Rows title="Valuation" rows={valuation} />
        <Rows title="Fundamentals" rows={fundamentals} />
      </div>
    </section>
  );
}

const quarter = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return `Q${Math.ceil(m / 3)} ${y}`;
};
const dmy = (d: string) => d.split("-").reverse().join("/");
const HOUR: Record<string, string> = {
  bmo: "before the open",
  amc: "after the close",
  dmh: "during the session",
};

/** Next results date, recent EPS surprises and the analysts' consensus. */
export function EarningsAnalystsCard({
  next,
  results,
  recs,
  resultsNote,
  target,
  price,
}: {
  next: { date: string; hour?: string; epsEstimate?: number } | null;
  results: EarningsResult[];
  recs: Recommendation[];
  resultsNote?: string;
  /** Analysts' mean price target, in the quote currency. */
  target?: { mean: number; analysts?: number; currency?: string };
  price?: number;
}) {
  if (!next && !results.length && !recs.length) return null;
  const upside = target && price ? (target.mean / price - 1) * 100 : undefined;
  const r = recs[0];
  const total = r ? r.strongBuy + r.buy + r.hold + r.sell + r.strongSell : 0;
  const parts = r
    ? [
        { k: "Strong buy", v: r.strongBuy, c: "var(--down)", o: 1 },
        { k: "Buy", v: r.buy, c: "var(--down)", o: 0.55 },
        { k: "Hold", v: r.hold, c: "var(--muted)", o: 0.5 },
        { k: "Sell", v: r.sell, c: "var(--up)", o: 0.55 },
        { k: "Strong sell", v: r.strongSell, c: "var(--up)", o: 1 },
      ]
    : [];
  const score =
    r && total
      ? (r.strongBuy * 5 + r.buy * 4 + r.hold * 3 + r.sell * 2 + r.strongSell) /
        total
      : undefined;
  const verdict =
    score == null
      ? undefined
      : score >= 4.2
        ? "Strong buy"
        : score >= 3.5
          ? "Buy"
          : score >= 2.6
            ? "Hold"
            : score >= 1.8
              ? "Sell"
              : "Strong sell";
  const prevR = recs[3];
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink">
        Earnings and analysts
      </h2>
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">
            Results
          </h3>
          {next ? (
            <p className="text-sm text-ink">
              Next: <strong className="font-semibold">{dmy(next.date)}</strong>
              {next.hour && HOUR[next.hour] ? (
                <span className="text-ink-2"> {HOUR[next.hour]}</span>
              ) : null}
              {next.epsEstimate != null && (
                <span className="text-ink-2">
                  {" "}
                  · EPS estimate {next.epsEstimate.toFixed(2)}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted">No results date announced yet.</p>
          )}
          {results.length > 0 && (
            <table className="num mt-2 w-full text-sm">
              <thead>
                <tr className="text-[11px] text-muted">
                  <th className="text-left font-normal">Quarter</th>
                  <th className="text-right font-normal">EPS</th>
                  <th className="text-right font-normal">Estimate</th>
                  <th className="text-right font-normal">Surprise</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 4).map((e) => (
                  <tr key={e.period} className="border-t border-line">
                    <td className="py-1 text-ink-2">{quarter(e.period)}</td>
                    <td className="py-1 text-right text-ink">
                      {e.actual?.toFixed(2)}
                    </td>
                    <td className="py-1 text-right text-ink-2">
                      {e.estimate?.toFixed(2) ?? "–"}
                    </td>
                    <td className="py-1 text-right">
                      <Pct v={e.surprisePct} dp={1} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {resultsNote && results.length > 0 && (
            <p className="mt-1 text-[11px] text-muted">{resultsNote}</p>
          )}
        </div>
        {r && total > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">
              Analyst ratings
            </h3>
            <p className="text-sm text-ink">
              {verdict} <span className="text-ink-2">· {total} analysts</span>
              {prevR && (
                <span className="text-xs text-muted">
                  {" "}
                  (buy-rated {Math.round(((r.strongBuy + r.buy) / total) * 100)}
                  % vs{" "}
                  {Math.round(
                    ((prevR.strongBuy + prevR.buy) /
                      Math.max(
                        1,
                        prevR.strongBuy +
                          prevR.buy +
                          prevR.hold +
                          prevR.sell +
                          prevR.strongSell,
                      )) *
                      100,
                  )}
                  % three months earlier)
                </span>
              )}
            </p>
            <div
              className="mt-2 flex h-3 overflow-hidden rounded-full bg-surface-2"
              role="img"
              aria-label={parts.map((p) => `${p.k} ${p.v}`).join(", ")}
            >
              {parts.map((p) =>
                p.v ? (
                  <div
                    key={p.k}
                    style={{
                      width: `${(p.v / total) * 100}%`,
                      background: p.c,
                      opacity: p.o,
                    }}
                    title={`${p.k}: ${p.v}`}
                  />
                ) : null,
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-ink-2">
              {parts.map((p) => (
                <span key={p.k}>
                  {p.k} <span className="num text-ink">{p.v}</span>
                </span>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              As of {r.period.slice(0, 7)}
            </p>
            {target && (
              <p className="mt-2 text-sm text-ink">
                Mean price target{" "}
                <span className="num font-semibold">
                  {fmtPrice(target.mean, target.currency)}
                </span>
                {upside != null && (
                  <span className="num ml-1">
                    (<Pct v={upside} dp={0} /> from here)
                  </span>
                )}
                {target.analysts ? (
                  <span className="text-xs text-muted">
                    {" "}
                    · {target.analysts} analysts
                  </span>
                ) : null}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Company details from Finnhub's profile. */
export function ProfileCard({
  profile,
  name,
}: {
  profile: CompanyProfile | null;
  name: string;
}) {
  if (!profile) return null;
  const rows: [string, React.ReactNode][] = [
    ["Sector", profile.sector],
    ["Industry", profile.industry],
    ["Country", profile.country],
    [
      "Employees",
      profile.employees ? profile.employees.toLocaleString("en-GB") : undefined,
    ],
    ["Exchange", profile.exchange],
    ["Listed since", profile.ipo ? dmy(profile.ipo) : undefined],
    ["Reporting currency", profile.currency],
    [
      "Website",
      profile.web ? (
        <a
          href={profile.web}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent"
        >
          {profile.web.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} ↗
        </a>
      ) : undefined,
    ],
  ];
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center gap-3">
        {profile.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- small external logo
          <img
            src={profile.logo}
            alt=""
            width={32}
            height={32}
            className="rounded bg-white object-contain p-0.5"
          />
        )}
        <h2 className="text-sm font-semibold text-ink">
          {profile.name ?? name}
        </h2>
      </div>
      <dl className="text-sm">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between gap-3 border-t border-line py-1"
            >
              <dt className="text-ink-2">{k}</dt>
              <dd className="text-right text-ink">{v}</dd>
            </div>
          ))}
      </dl>
      {profile.summary && (
        <details className="mt-2 text-sm text-ink-2">
          <summary className="cursor-pointer text-xs text-accent">
            About the company
          </summary>
          <p className="mt-1 leading-relaxed">{profile.summary}</p>
        </details>
      )}
    </section>
  );
}

/** Links to similar companies, with today's move where we have it. */
export function PeersCard({
  peers,
}: {
  peers: { symbol: string; name: string; change?: number }[];
}) {
  if (!peers.length) return null;
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink">Peers</h2>
      <div className="flex flex-wrap gap-1.5">
        {peers.map((p) => (
          <Link
            key={p.symbol}
            href={`/equities/stock?tvwidgetsymbol=${encodeURIComponent(p.symbol)}`}
            className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2 hover:border-[color:var(--accent)] hover:text-ink"
          >
            {p.name}
            {p.change != null && (
              <span className="num ml-1.5">
                <Pct v={p.change} dp={1} />
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
