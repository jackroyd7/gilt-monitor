import "server-only";
import { companyData, type CompanyData } from "./company-data";
import { unitsPerPound } from "./fx-convert";
import { rangeStats } from "./price-tools";
import { fmtMoney } from "./stock-metrics";
import { reviewTips, type Review, type ReviewInput } from "./tips-ai";
import {
  correlation,
  holdingValue,
  returnSince,
  suggestTrades,
  targetFor,
  targetWeights,
  type Book,
  type Candidate,
  type Suggestion,
  type Tip,
} from "./tips";

// Weekly tips → data for each stock → the AI's review → target weights and trades.

type Pt = [string, number];

export interface AnalysedStock extends Candidate {
  held: boolean;
  tip?: Tip;
  review?: Review;
  sinceTip?: number | null;
  /** Average daily value traded over 3 months, £. */
  liquidityGbp?: number;
  missing?: string;
}

export interface Analysis {
  overview: string;
  stocks: AnalysedStock[];
  weights: Record<string, number>;
  /** Correlations of daily returns between the stocks rated "include". */
  corr: Record<string, Record<string, number>>;
  suggestions: Suggestion[];
  totalGbp: number;
  asOf: string;
}

const pct = (v: number | null | undefined, dp = 1) =>
  v == null ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(dp)}%`;
const x = (v?: number) => (v == null ? undefined : `${v.toFixed(1)}x`);

async function mapLimit<T, R>(
  items: T[],
  n: number,
  f: (t: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await f(items[k]);
      }
    }),
  );
  return out;
}

function facts(
  d: CompanyData,
  tip: Tip | undefined,
  perPound: number | null,
  held: string | undefined,
): { text: string; vol?: number; sinceTip: number | null; liqGbp?: number } {
  const h = d.history;
  const pts = (h?.points ?? []) as Pt[];
  const price = h?.price;
  const ccy = h?.currency;
  const last = pts.at(-1)?.[0] ?? "";
  const back = (days: number) =>
    last
      ? new Date(Date.parse(last) - days * 86_400_000)
          .toISOString()
          .slice(0, 10)
      : "";
  const year = pts.filter(([day]) => day >= back(366));
  const st = rangeStats(year);
  const sinceTip = tip ? returnSince(pts, tip.week) : null;
  const vols = (h?.volumes ?? [])
    .slice(-63)
    .filter((v): v is number => v != null && v > 0);
  const liqGbp =
    vols.length && price && perPound
      ? (vols.reduce((a, b) => a + b, 0) / vols.length) * (price / perPound)
      : undefined;
  const capCcy = d.capCurrency ?? d.profile?.currency;
  const m = d.metrics;
  const lines: string[] = [];
  if (tip) {
    lines.push(
      `Tip (${tip.week}, ${tip.source ?? "unknown source"}): ${tip.call.toUpperCase()}${tip.priceAtTip ? ` at ${tip.priceAtTip}${tip.currency === "GBp" ? "p" : ` ${tip.currency ?? ""}`}` : ""}${tip.target ? `, tipster's target ${tip.target}` : ""}. ${tip.rationale ?? ""}`,
    );
  }
  if (held) lines.push(`Held: ${held}`);
  if (price != null)
    lines.push(
      `Price ${price}${ccy === "GBp" ? "p" : ` ${ccy ?? ""}`} (${d.ys?.profile.name ?? d.name}; ${[d.fullProfile?.sector, d.fullProfile?.industry, d.fullProfile?.country].filter(Boolean).join(", ") || "sector unknown"}). Since tip ${pct(sinceTip)}; 1m ${pct(returnSince(pts, back(31)))}; 3m ${pct(returnSince(pts, back(92)))}; 1y ${pct(returnSince(pts, back(366)))}. 52-week range ${st ? `${st.low.toFixed(2)}–${st.high.toFixed(2)}` : "n/a"}; volatility ${st?.vol?.toFixed(0) ?? "n/a"}%; 1-year max drawdown ${st ? st.maxDrawdown.toFixed(0) : "n/a"}%.`,
    );
  else lines.push("No price data.");
  const val = [
    m?.marketCap != null
      ? `market cap ${fmtMoney(m.marketCap, capCcy === "GBp" ? "GBP" : capCcy)}`
      : undefined,
    liqGbp ? `average daily trading £${(liqGbp / 1e6).toFixed(1)}m` : undefined,
    x(m?.trailingPE) && `P/E ${x(m?.trailingPE)}`,
    x(m?.forwardPE) && `forward P/E ${x(m?.forwardPE)}`,
    x(m?.priceToBook) && `P/B ${x(m?.priceToBook)}`,
    x(m?.evToEbitda) && `EV/EBITDA ${x(m?.evToEbitda)}`,
    m?.dividendYield != null
      ? `yield ${(m.dividendYield * 100).toFixed(1)}%`
      : undefined,
    m?.profitMargin != null
      ? `net margin ${(m.profitMargin * 100).toFixed(0)}%`
      : undefined,
    m?.returnOnEquity != null
      ? `ROE ${(m.returnOnEquity * 100).toFixed(0)}%`
      : undefined,
    m?.revenueGrowth != null
      ? `revenue growth ${(m.revenueGrowth * 100).toFixed(0)}%`
      : undefined,
    m?.debtToEquity != null
      ? `debt/equity ${m.debtToEquity.toFixed(1)}x`
      : undefined,
  ].filter(Boolean);
  lines.push(
    val.length
      ? `Fundamentals (${d.metricsSource}): ${val.join("; ")}.`
      : `Fundamentals: none available (${d.missing ?? "no source"}).`,
  );
  const r = d.recs[0];
  if (r)
    lines.push(
      `Analysts: ${r.strongBuy + r.buy} buy, ${r.hold} hold, ${r.sell + r.strongSell} sell.`,
    );
  if (d.ys?.target)
    lines.push(
      `Analysts' mean target ${d.ys.target.mean}${ccy === "GBp" ? "p" : ""}.`,
    );
  if (d.next) lines.push(`Next results ${d.next.date}.`);
  return { text: lines.join("\n"), vol: st?.vol, sinceTip, liqGbp };
}

/** Reviews this week's tips together with what's already held, and proposes trades. */
export async function analyseTips(
  tips: Tip[],
  book: Book,
  newMoney: number,
): Promise<Analysis> {
  const today = new Date().toISOString().slice(0, 10);
  const tipBySymbol = new Map<string, Tip>();
  for (const t of tips)
    if (t.symbol && t.call !== "sell") tipBySymbol.set(t.symbol, t);
  // Sell tips only matter for stocks we hold.
  for (const t of tips)
    if (
      t.symbol &&
      t.call === "sell" &&
      book.holdings.some((h) => h.symbol === t.symbol)
    )
      tipBySymbol.set(t.symbol, t);
  const symbols = [
    ...new Set([...tipBySymbol.keys(), ...book.holdings.map((h) => h.symbol)]),
  ].slice(0, 40);
  if (!symbols.length)
    throw new Error("Pick at least one tip with a matched listing.");

  const data = await mapLimit(symbols, 4, async (symbol) => {
    const d = await companyData(symbol);
    const perPound = await unitsPerPound(d.history?.currency);
    return { symbol, d, perPound };
  });

  const inputs: ReviewInput[] = [];
  const base: Record<
    string,
    Omit<AnalysedStock, "verdict" | "conviction">
  > = {};
  for (const { symbol, d, perPound } of data) {
    const holding = book.holdings.find((h) => h.symbol === symbol);
    const tip = tipBySymbol.get(symbol);
    const f = facts(
      d,
      tip,
      perPound,
      holding
        ? `${holding.shares} shares since ${holding.boughtAt} at ${holding.cost}`
        : undefined,
    );
    if (d.history?.price == null || !perPound) continue;
    base[symbol] = {
      symbol: d.symbol,
      name: d.name,
      sector: d.fullProfile?.sector ?? d.fullProfile?.industry ?? undefined,
      country: d.fullProfile?.country ?? undefined,
      price: d.history.price,
      currency: d.history.currency,
      perPound,
      vol: f.vol,
      held: !!holding,
      tip,
      tipId: tip?.id,
      sinceTip: f.sinceTip,
      liquidityGbp: f.liqGbp,
      missing: d.metrics ? undefined : d.missing,
    };
    inputs.push({ symbol, name: d.name, held: !!holding, facts: f.text });
  }
  if (!inputs.length)
    throw new Error("Couldn't get prices for any of these stocks right now.");

  const valueOf = (sym: string) => base[sym];
  const total =
    book.cash +
    newMoney +
    book.holdings.reduce(
      (s, h) =>
        s +
        holdingValue(h, valueOf(h.symbol)?.price, valueOf(h.symbol)?.perPound),
      0,
    );
  const holdingsNote = book.holdings.length
    ? `£${Math.round(total).toLocaleString("en-GB")} in total, £${Math.round(book.cash + newMoney).toLocaleString("en-GB")} cash. ` +
      book.holdings
        .map((h) => {
          const b = valueOf(h.symbol);
          const v = holdingValue(h, b?.price, b?.perPound);
          return `${h.name} (${h.sector ?? "?"}) ${((v / total) * 100).toFixed(0)}%`;
        })
        .join(", ")
    : `None yet; £${Math.round(total).toLocaleString("en-GB")} to invest.`;

  const { overview, reviews } = await reviewTips(
    inputs,
    book.settings,
    holdingsNote,
  );
  const reviewOf = new Map(reviews.map((r) => [r.symbol, r]));

  const stocks: AnalysedStock[] = Object.values(base).map((b) => {
    const r = reviewOf.get(b.symbol);
    return {
      ...b,
      review: r,
      verdict: r?.verdict ?? "maybe",
      conviction: r?.conviction ?? 2,
      target: targetFor(b.price, r?.target ?? undefined, book.settings.horizon),
    };
  });

  // Correlations between the stocks that could be held, from a year of daily closes.
  const pts = new Map(
    data.map(({ symbol, d }) => [symbol, (d.history?.points ?? []) as Pt[]]),
  );
  const corr: Record<string, Record<string, number>> = {};
  const inc = stocks.filter((s) => s.verdict === "include");
  for (let i = 0; i < inc.length; i++)
    for (let j = i + 1; j < inc.length; j++) {
      const c = correlation(
        pts.get(inc[i].symbol) ?? [],
        pts.get(inc[j].symbol) ?? [],
      );
      if (c != null) (corr[inc[i].symbol] ??= {})[inc[j].symbol] = c;
    }

  const weights = targetWeights(stocks, book.settings, corr);
  const suggestions = suggestTrades(book, stocks, weights, today, newMoney);
  return {
    overview,
    stocks,
    weights,
    corr,
    suggestions,
    totalGbp: total,
    asOf: new Date().toISOString(),
  };
}
