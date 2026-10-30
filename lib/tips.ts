// Weekly stock tips → a diversified portfolio. Pure functions: the AI judges each tip
// (lib/tips-analyse.ts); this file turns those judgements into weights, share counts,
// targets, stops and week-by-week trades, so the arithmetic is predictable and tested.

export type Call = "buy" | "hold" | "sell";
export type Risk = "cautious" | "balanced" | "adventurous";
export type Horizon = "6m" | "1y" | "3y";
export type Verdict = "include" | "maybe" | "skip";

/** One tip as read from a screenshot (and checked by you). */
export interface Tip {
  id: string;
  /** Issue date, YYYY-MM-DD. */
  week: string;
  company: string;
  /** Our stock-page symbol, e.g. "LSE:BARC" or "NASDAQ:AAPL". */
  symbol?: string;
  call: Call;
  /** Publication the tip comes from (The Week gathers them), e.g. "Investors' Chronicle". */
  source?: string;
  priceAtTip?: number;
  currency?: string;
  target?: number;
  /** A short summary of the tipster's case, in our words. */
  rationale?: string;
}

export interface Holding {
  symbol: string;
  name: string;
  shares: number;
  /** Price paid per share, in the listing currency (pence for London). */
  cost: number;
  currency?: string;
  /** Total paid, in pounds. */
  costGbp: number;
  boughtAt: string;
  tipId?: string;
  target?: number;
  stop?: number;
  /** Review the position by this date (end of the chosen horizon). */
  reviewBy?: string;
  sector?: string;
}

export interface Trade {
  date: string;
  symbol: string;
  name: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  currency?: string;
  gbp: number;
  reason: string;
}

export interface Settings {
  risk: Risk;
  horizon: Horizon;
}

export interface Book {
  cash: number;
  holdings: Holding[];
  trades: Trade[];
  settings: Settings;
}

/** A stock the portfolio could hold: a new tip or an existing holding, with our data and the AI's view. */
export interface Candidate {
  symbol: string;
  name: string;
  sector?: string;
  country?: string;
  /** Latest price in the listing currency, and units of that currency per £1. */
  price: number;
  currency?: string;
  perPound: number;
  /** Annualised volatility, %. */
  vol?: number;
  verdict: Verdict;
  /** 1 (weak) to 5 (strong). */
  conviction: number;
  /** AI's price target over the horizon, in the listing currency. */
  target?: number;
  tipId?: string;
}

export const RISK: Record<
  Risk,
  {
    label: string;
    maxPosition: number;
    maxSector: number;
    cash: number;
    maxVol: number;
    stopK: number;
    note: string;
  }
> = {
  cautious: {
    label: "Cautious",
    maxPosition: 0.08,
    maxSector: 0.25,
    cash: 0.1,
    maxVol: 40,
    stopK: 1.0,
    note: "At most 8% in one stock and 25% in one sector; 10% cash; leaves out very volatile shares.",
  },
  balanced: {
    label: "Balanced",
    maxPosition: 0.1,
    maxSector: 0.3,
    cash: 0.05,
    maxVol: 60,
    stopK: 1.25,
    note: "At most 10% in one stock and 30% in one sector; 5% cash.",
  },
  adventurous: {
    label: "Adventurous",
    maxPosition: 0.15,
    maxSector: 0.4,
    cash: 0.02,
    maxVol: 999,
    stopK: 1.5,
    note: "Up to 15% in one stock and 40% in one sector; 2% cash; speculative names allowed.",
  },
};

export const HORIZON: Record<
  Horizon,
  { label: string; years: number; maxUpside: number }
> = {
  "6m": { label: "6 months", years: 0.5, maxUpside: 0.3 },
  "1y": { label: "1 year", years: 1, maxUpside: 0.5 },
  "3y": { label: "3 years", years: 3, maxUpside: 1.0 },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const gbp = (price: number, perPound: number) => price / perPound;

/** Stop level below the price: wider for volatile shares, longer horizons and more risk. */
export function stopFor(
  price: number,
  vol: number | undefined,
  s: Settings,
): number {
  const quarterVol = (vol ?? 30) / 100 / 2; // a quarter's typical move
  const horizonK = s.horizon === "6m" ? 0.85 : s.horizon === "3y" ? 1.2 : 1;
  const pct = clamp(
    quarterVol * RISK[s.risk].stopK * horizonK * 1.6,
    0.08,
    0.35,
  );
  return price * (1 - pct);
}

/** The AI's target, kept within what the horizon can plausibly deliver. */
export function targetFor(
  price: number,
  aiTarget: number | undefined,
  h: Horizon,
): number | undefined {
  if (aiTarget == null || !(aiTarget > 0)) return undefined;
  return Math.min(aiTarget, price * (1 + HORIZON[h].maxUpside));
}

/**
 * Target weights: conviction over volatility (so steadier shares get more), trimmed for
 * pairs that move together, then capped per stock and per sector. What can't be placed
 * within the caps stays in cash until later weeks bring more ideas.
 */
export function targetWeights(
  cands: Candidate[],
  s: Settings,
  corr: Record<string, Record<string, number>> = {},
): Record<string, number> {
  const p = RISK[s.risk];
  const eligible = cands.filter(
    (c) => c.verdict === "include" && (c.vol ?? 0) <= p.maxVol,
  );
  if (!eligible.length) return {};
  const raw: Record<string, number> = {};
  for (const c of eligible)
    raw[c.symbol] = clamp(c.conviction, 1, 5) / 3 / Math.max(15, c.vol ?? 30);
  for (let i = 0; i < eligible.length; i++)
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i].symbol;
      const b = eligible[j].symbol;
      if ((corr[a]?.[b] ?? corr[b]?.[a] ?? 0) > 0.7) {
        raw[a] *= 0.8;
        raw[b] *= 0.8;
      }
    }
  const investable = 1 - p.cash;
  const total = Object.values(raw).reduce((x, y) => x + y, 0);
  const w: Record<string, number> = {};
  for (const k in raw) w[k] = (raw[k] / total) * investable;
  const sectorOf = Object.fromEntries(
    eligible.map((c) => [c.symbol, c.sector ?? c.symbol]),
  );
  // Cap, then hand any excess to names with room, a few times over.
  for (let round = 0; round < 10; round++) {
    let excess = 0;
    const capped = new Set<string>();
    for (const k in w)
      if (w[k] > p.maxPosition) {
        excess += w[k] - p.maxPosition;
        w[k] = p.maxPosition;
        capped.add(k);
      }
    const bySector: Record<string, string[]> = {};
    for (const k in w) (bySector[sectorOf[k]] ??= []).push(k);
    for (const members of Object.values(bySector)) {
      const sum = members.reduce((x, k) => x + w[k], 0);
      if (sum > p.maxSector) {
        const f = p.maxSector / sum;
        for (const k of members) {
          excess += w[k] * (1 - f);
          w[k] *= f;
          capped.add(k);
        }
      }
    }
    const fullSectors = new Set(
      Object.entries(bySector)
        .filter(
          ([, m]) => m.reduce((x, k) => x + w[k], 0) >= p.maxSector - 1e-9,
        )
        .map(([sec]) => sec),
    );
    const open = Object.keys(w).filter(
      (k) =>
        !capped.has(k) &&
        w[k] < p.maxPosition - 1e-9 &&
        !fullSectors.has(sectorOf[k]),
    );
    if (excess < 1e-9 || !open.length) break;
    const base = open.reduce((x, k) => x + w[k], 0);
    for (const k of open) w[k] += excess * (w[k] / base);
  }
  return w;
}

export interface Suggestion {
  symbol: string;
  name: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  currency?: string;
  gbp: number;
  reason: string;
  target?: number;
  stop?: number;
  tipId?: string;
  sector?: string;
}

export const holdingValue = (
  h: Holding,
  price: number | undefined,
  perPound: number | undefined,
) => (price != null && perPound ? gbp(price, perPound) * h.shares : h.costGbp);

/**
 * This week's trades: sells for stops hit, targets reached, positions that have grown too
 * big or tips you've decided to drop; then buys towards the target weights with the cash
 * available (plus any new money). Small top-ups are skipped to avoid churn.
 */
export function suggestTrades(
  book: Book,
  cands: Candidate[],
  weights: Record<string, number>,
  today: string,
  newMoney = 0,
): Suggestion[] {
  const bySym = Object.fromEntries(cands.map((c) => [c.symbol, c]));
  const value = (h: Holding) =>
    holdingValue(h, bySym[h.symbol]?.price, bySym[h.symbol]?.perPound);
  const total =
    book.cash + newMoney + book.holdings.reduce((x, h) => x + value(h), 0);
  const out: Suggestion[] = [];
  let cash = book.cash + newMoney;
  const minTrade = Math.max(250, total * 0.01);

  for (const h of book.holdings) {
    const c = bySym[h.symbol];
    if (!c) continue;
    const sell = (shares: number, reason: string) => {
      const s = Math.min(h.shares, Math.floor(shares));
      if (s <= 0) return;
      const v = gbp(c.price, c.perPound) * s;
      cash += v;
      out.push({
        symbol: h.symbol,
        name: h.name,
        side: "sell",
        shares: s,
        price: c.price,
        currency: c.currency,
        gbp: v,
        reason,
        sector: h.sector,
      });
    };
    if (h.stop != null && c.price <= h.stop)
      sell(h.shares, "Fell through its stop level: sell to limit the loss.");
    else if (c.verdict === "skip")
      sell(h.shares, "No longer passes the review: sell.");
    else if (h.target != null && c.price >= h.target)
      sell(
        h.shares / 2,
        "Reached its price target: take half the profit and review the rest.",
      );
    else if (h.reviewBy && today >= h.reviewBy)
      sell(
        h.shares / 2,
        "Reached the end of its horizon: take half off and decide on the rest.",
      );
    else {
      const want = (weights[h.symbol] ?? 0) * total;
      const have = value(h);
      if (want > 0 && have > want * 1.25 && have - want >= minTrade)
        sell(
          (have - want) / gbp(c.price, c.perPound),
          "Grown above its share of the portfolio: trim back to target.",
        );
    }
  }

  const held = Object.fromEntries(book.holdings.map((h) => [h.symbol, h]));
  const sold = new Set(
    out.filter((o) => o.side === "sell").map((o) => o.symbol),
  );
  const buys = Object.entries(weights)
    .map(([sym, w]) => {
      const c = bySym[sym];
      const have = held[sym] && !sold.has(sym) ? value(held[sym]) : 0;
      return { c, gap: w * total - have };
    })
    .filter((b) => b.c && b.gap >= minTrade)
    .sort((a, b) => b.c.conviction - a.c.conviction || b.gap - a.gap);
  for (const { c, gap } of buys) {
    const unit = gbp(c.price, c.perPound);
    const shares = Math.floor(Math.min(gap, cash) / unit);
    if (shares <= 0 || shares * unit < minTrade) continue;
    cash -= shares * unit;
    out.push({
      symbol: c.symbol,
      name: c.name,
      side: "buy",
      shares,
      price: c.price,
      currency: c.currency,
      gbp: shares * unit,
      reason: held[c.symbol]
        ? "Top up towards its target weight."
        : "New position from this week's tips.",
      target: c.target,
      tipId: c.tipId,
      sector: c.sector,
    });
  }
  return out;
}

const addMonths = (date: string, months: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

/** Applies accepted trades to the book. Buys get a stop and a review date from the settings. */
export function applyTrades(
  book: Book,
  trades: Suggestion[],
  cands: Candidate[],
  today: string,
  newMoney = 0,
): Book {
  const bySym = Object.fromEntries(cands.map((c) => [c.symbol, c]));
  let cash = book.cash + newMoney;
  const holdings = book.holdings.map((h) => ({ ...h }));
  const log: Trade[] = [];
  for (const t of trades) {
    if (t.side === "sell") {
      const h = holdings.find((x) => x.symbol === t.symbol);
      if (!h) continue;
      const shares = Math.min(h.shares, t.shares);
      const f = shares / h.shares;
      h.costGbp *= 1 - f;
      h.shares -= shares;
      cash += t.gbp * (shares / t.shares);
      log.push({
        date: today,
        symbol: t.symbol,
        name: t.name,
        side: "sell",
        shares,
        price: t.price,
        currency: t.currency,
        gbp: t.gbp * (shares / t.shares),
        reason: t.reason,
      });
    } else {
      const spend = Math.min(t.gbp, cash);
      const shares = Math.floor(t.shares * (spend / t.gbp));
      if (shares <= 0) continue;
      const cost = t.gbp * (shares / t.shares);
      cash -= cost;
      const c = bySym[t.symbol];
      const h = holdings.find((x) => x.symbol === t.symbol);
      const months =
        book.settings.horizon === "6m"
          ? 6
          : book.settings.horizon === "1y"
            ? 12
            : 36;
      const stop = stopFor(t.price, c?.vol, book.settings);
      if (h) {
        h.cost = (h.cost * h.shares + t.price * shares) / (h.shares + shares);
        h.shares += shares;
        h.costGbp += cost;
        h.target = t.target ?? h.target;
        h.stop = Math.max(h.stop ?? 0, stop);
      } else {
        holdings.push({
          symbol: t.symbol,
          name: t.name,
          shares,
          cost: t.price,
          currency: t.currency,
          costGbp: cost,
          boughtAt: today,
          tipId: t.tipId,
          target: t.target,
          stop,
          reviewBy: addMonths(today, months),
          sector: t.sector,
        });
      }
      log.push({
        date: today,
        symbol: t.symbol,
        name: t.name,
        side: "buy",
        shares,
        price: t.price,
        currency: t.currency,
        gbp: cost,
        reason: t.reason,
      });
    }
  }
  return {
    ...book,
    cash,
    holdings: holdings.filter((h) => h.shares > 0),
    trades: [...book.trades, ...log],
  };
}

/** % change from the last price on or before `date` to the latest. */
export function returnSince(
  points: [string, number][],
  date: string,
): number | null {
  let base: number | undefined;
  for (const [d, v] of points) {
    if (d > date) break;
    base = v;
  }
  const last = points.at(-1)?.[1];
  return base && last ? (last / base - 1) * 100 : null;
}

/** Correlation of daily returns over the last `days` common dates. */
export function correlation(
  a: [string, number][],
  b: [string, number][],
  days = 250,
): number | null {
  const mb = new Map(b);
  const common = a.filter(([d]) => mb.has(d)).slice(-(days + 1));
  if (common.length < 40) return null;
  const ra: number[] = [];
  const rb: number[] = [];
  for (let i = 1; i < common.length; i++) {
    ra.push(Math.log(common[i][1] / common[i - 1][1]));
    rb.push(Math.log(mb.get(common[i][0])! / mb.get(common[i - 1][0])!));
  }
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = mean(ra);
  const mbb = mean(rb);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < ra.length; i++) {
    cov += (ra[i] - ma) * (rb[i] - mbb);
    va += (ra[i] - ma) ** 2;
    vb += (rb[i] - mbb) ** 2;
  }
  return va && vb ? cov / Math.sqrt(va * vb) : null;
}

export const horizonMonths = (h: Horizon) =>
  h === "6m" ? 6 : h === "1y" ? 12 : 36;

/**
 * Adds a holding you bought yourself (any share, ETF or fund). With `fromCash` the cost
 * comes out of the portfolio's cash; otherwise it's new money brought in with the shares.
 */
export function addHolding(
  book: Book,
  h: {
    symbol: string;
    name: string;
    shares: number;
    cost: number;
    currency?: string;
    perPound: number;
    date: string;
    target?: number;
    stop?: number;
    sector?: string;
  },
  fromCash: boolean,
): Book {
  const costGbp = (h.shares * h.cost) / h.perPound;
  const holdings = book.holdings.map((x) => ({ ...x }));
  const existing = holdings.find((x) => x.symbol === h.symbol);
  if (existing) {
    existing.cost =
      (existing.cost * existing.shares + h.cost * h.shares) /
      (existing.shares + h.shares);
    existing.shares += h.shares;
    existing.costGbp += costGbp;
    existing.target = h.target ?? existing.target;
    existing.stop = h.stop ?? existing.stop;
  } else {
    holdings.push({
      symbol: h.symbol,
      name: h.name,
      shares: h.shares,
      cost: h.cost,
      currency: h.currency,
      costGbp,
      boughtAt: h.date,
      target: h.target,
      stop: h.stop,
      reviewBy: addMonths(h.date, horizonMonths(book.settings.horizon)),
      sector: h.sector,
    });
  }
  const trade: Trade = {
    date: h.date,
    symbol: h.symbol,
    name: h.name,
    side: "buy",
    shares: h.shares,
    price: h.cost,
    currency: h.currency,
    gbp: costGbp,
    reason: "Added by hand.",
  };
  return {
    ...book,
    cash: fromCash ? book.cash - costGbp : book.cash,
    holdings,
    trades: [...book.trades, trade],
  };
}

/** Corrects a holding's shares, average cost, target or stop (e.g. to match the prices you actually dealt at). */
export function editHolding(
  book: Book,
  symbol: string,
  patch: {
    shares?: number;
    cost?: number;
    target?: number | null;
    stop?: number | null;
  },
): Book {
  return {
    ...book,
    holdings: book.holdings
      .map((h) => {
        if (h.symbol !== symbol) return h;
        const shares = patch.shares ?? h.shares;
        const cost = patch.cost ?? h.cost;
        const scale =
          h.shares && h.cost ? (shares * cost) / (h.shares * h.cost) : 1;
        return {
          ...h,
          shares,
          cost,
          costGbp: h.costGbp * scale,
          target:
            patch.target === null ? undefined : (patch.target ?? h.target),
          stop: patch.stop === null ? undefined : (patch.stop ?? h.stop),
        };
      })
      .filter((h) => h.shares > 0),
  };
}

/** Pays cash in (positive) or takes it out (negative). */
export const adjustCash = (book: Book, amount: number): Book => ({
  ...book,
  cash: book.cash + amount,
});

/** Deletes a holding outright (e.g. one added by mistake): no sale is recorded and cash is unchanged. */
export const removeHolding = (book: Book, symbol: string): Book => ({
  ...book,
  holdings: book.holdings.filter((h) => h.symbol !== symbol),
});
