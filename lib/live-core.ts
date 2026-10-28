// Fetches giltsyield.com prices for every gilt. Shared by the web server (lib/live.ts,
// which caches it) and the daily data job (which records closes into the history).

import { giltYieldFromClean } from "./bond";
import { giltsYield } from "./giltsyield-core";
import { annualToSemiannual, normaliseYieldUnits, parseBondRow, parsePriceRow } from "./live-parse";
import { excludedGilt } from "./parsers";
import type { Gilt, LiveSnapshot } from "./types";

export async function mapLimited<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Prices every gilt: /api/bonds/ for the list, then /api/bond/price/<ticker>/ for each
 * (there is no "all prices" endpoint). With `date`, fetches that day's close instead.
 */
export async function fetchAllPrices(opts: { date?: string; concurrency?: number } = {}): Promise<LiveSnapshot> {
  const fetchedAt = new Date().toISOString();
  const today = fetchedAt.slice(0, 10);
  const bonds = (await giltsYield.bonds())
    .map(parseBondRow)
    .filter((b) => b.ticker && (!b.maturity || b.maturity > (opts.date ?? today)))
    .filter((b) => !excludedGilt(b));

  const prices = await mapLimited(bonds, opts.concurrency ?? 6, async (b) => parsePriceRow(await giltsYield.bondPrice(b.ticker, opts.date)));

  const gilts: Gilt[] = [];
  let failed = 0;
  let priceTime: string | undefined;
  bonds.forEach((b, i) => {
    const res = prices[i];
    if (res.status !== "fulfilled") {
      failed++;
      return;
    }
    const p = res.value;
    if (p.time && (!priceTime || p.time > priceTime)) priceTime = p.time;
    gilts.push({
      isin: b.isin || b.ticker,
      name: b.name,
      type: b.type,
      coupon: b.coupon,
      maturity: b.maturity,
      indexLag: b.indexLag,
      ticker: b.ticker,
      cleanPrice: p.clean,
      dirtyPrice: p.dirty,
      yield: p.ytm,
      live: true,
    });
  });

  normaliseYieldUnits(gilts);
  // Their yields are annual-compounded; convert to the semi-annual gilt convention.
  for (const g of gilts) if (g.yield != null) g.yield = annualToSemiannual(g.yield);
  for (const g of gilts) {
    if (g.yield == null && g.cleanPrice != null && g.coupon != null && g.maturity && g.type === "conventional") {
      const calc = giltYieldFromClean(g.cleanPrice, g.coupon, g.maturity, opts.date ?? today);
      if (calc) {
        g.yield = calc.yield;
        g.yieldComputed = true;
      }
    }
  }
  if (!gilts.length) throw new Error(`no prices returned (${failed} of ${bonds.length} price calls failed)`);
  return { fetchedAt, priceTime, gilts, failed };
}

