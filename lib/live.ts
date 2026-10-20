import "server-only";
import { giltYieldFromClean } from "./bond";
import { giltsYield, giltsYieldConfigured } from "./giltsyield";
import { normaliseYieldUnits, parseBondRow, parsePriceRow } from "./live-parse";
import type { Gilt } from "./types";

export { withLive } from "./live-parse";

// Intraday gilt prices from giltsyield.com (refreshed there about every 10 minutes).
// There is no "all prices" endpoint, so we list gilts with /api/bonds/ and call
// /api/bond/price/<ticker>/ for each, a few at a time. Results are cached in memory
// for CACHE_MS so page loads don't re-fetch ~100 prices each time.

const CACHE_MS = Number(process.env.LIVE_CACHE_SECONDS ?? 300) * 1000;
const CONCURRENCY = 6;

export interface LiveSnapshot {
  fetchedAt: string; // ISO, when we called the API
  priceTime?: string; // latest timestamp reported by giltsyield, if any
  gilts: Gilt[];
  failed: number;
  error?: string;
}

// Next bundles each route separately, so a module-level variable would give every page
// its own cache. Keep it on globalThis so all pages in the server process share one.
const store = ((globalThis as { __giltLive?: { cache: { at: number; snap: LiveSnapshot } | null; inflight: Promise<LiveSnapshot> | null } })
  .__giltLive ??= { cache: null, inflight: null });

export function liveConfigured() {
  return giltsYieldConfigured() && process.env.LIVE_PRICES !== "off";
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
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

async function load(): Promise<LiveSnapshot> {
  const fetchedAt = new Date().toISOString();
  const today = fetchedAt.slice(0, 10);
  const bonds = (await giltsYield.bonds())
    .map(parseBondRow)
    .filter((b) => b.ticker && (!b.maturity || b.maturity > today));

  const prices = await mapLimited(bonds, CONCURRENCY, async (b) => parsePriceRow(await giltsYield.bondPrice(b.ticker)));

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
      cleanPrice: p.clean,
      dirtyPrice: p.dirty,
      yield: p.ytm,
      live: true,
    });
  });

  normaliseYieldUnits(gilts);
  for (const g of gilts) {
    if (g.yield == null && g.cleanPrice != null && g.coupon != null && g.maturity && g.type === "conventional") {
      const calc = giltYieldFromClean(g.cleanPrice, g.coupon, g.maturity, today);
      if (calc) {
        g.yield = calc.yield;
        g.yieldComputed = true;
      }
    }
  }
  if (!gilts.length) throw new Error(`no prices returned (${failed} of ${bonds.length} price calls failed)`);
  return { fetchedAt, priceTime, gilts, failed };
}

/** Cached live snapshot, or null when no API key is configured. Never throws. */
export async function getLive(opts: { force?: boolean } = {}): Promise<LiveSnapshot | null> {
  if (!liveConfigured()) return null;
  if (!opts.force && store.cache && Date.now() - store.cache.at < CACHE_MS) return store.cache.snap;
  store.inflight ??= load()
    .then((snap) => {
      store.cache = { at: Date.now(), snap };
      return snap;
    })
    .catch((e: Error): LiveSnapshot => {
      // Keep serving the last good prices if a refresh fails.
      if (store.cache) return { ...store.cache.snap, error: e.message };
      return { fetchedAt: new Date().toISOString(), gilts: [], failed: 0, error: e.message };
    })
    .finally(() => {
      store.inflight = null;
    });
  return store.inflight;
}


/** The serialisable summary the LiveBar client component needs. */
export function liveInfo(live: LiveSnapshot | null) {
  return live && { fetchedAt: live.fetchedAt, priceTime: live.priceTime, count: live.gilts.length, failed: live.failed, error: live.error };
}
