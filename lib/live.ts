import "server-only";
import { giltsYieldConfigured } from "./giltsyield";
import { fetchAllPrices } from "./live-core";
import type { LiveSnapshot } from "./types";

export { withLive } from "./live-parse";

// Intraday gilt prices from giltsyield.com (refreshed there about every 10 minutes),
// cached in memory for CACHE_MS so page loads don't re-fetch ~100 prices each time.

const CACHE_MS = Number(process.env.LIVE_CACHE_SECONDS ?? 300) * 1000;

export type { LiveSnapshot };

// Next bundles each route separately, so a module-level variable would give every page
// its own cache. Keep it on globalThis so all pages in the server process share one.
const store = ((globalThis as { __giltLive?: { cache: { at: number; snap: LiveSnapshot } | null; inflight: Promise<LiveSnapshot> | null } })
  .__giltLive ??= { cache: null, inflight: null });

export function liveConfigured() {
  return giltsYieldConfigured() && process.env.LIVE_PRICES !== "off";
}

/** Cached live snapshot, or null when no API key is configured. Never throws. */
export async function getLive(opts: { force?: boolean } = {}): Promise<LiveSnapshot | null> {
  if (!liveConfigured()) return null;
  if (!opts.force && store.cache && Date.now() - store.cache.at < CACHE_MS) return store.cache.snap;
  store.inflight ??= fetchAllPrices()
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
