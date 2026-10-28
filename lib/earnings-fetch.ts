import "server-only";
import { STOCKS, US_LISTINGS } from "@/config/stock-catalogue";
import { addDays } from "./curve";
import { matchEarnings, type EarningsEvent } from "./earnings";

// Finnhub earnings calendar (free API key). Cached in a process-wide store for 3 hours;
// the window is split into weekly requests because each response is capped.
const CACHE_MS = 3 * 3600_000;
const BASE = (process.env.FINNHUB_BASE_URL ?? "https://finnhub.io/api/v1").replace(/\/$/, "");

export const finnhubKey = () =>
  process.env.FINNHUB_API_KEY ?? Object.entries(process.env).find(([k, v]) => k.startsWith("FINNHUB") && k.includes("KEY") && v)?.[1];

export interface EarningsSnapshot {
  fetchedAt: string;
  from: string;
  to: string;
  events: EarningsEvent[];
  error?: string;
}

const store = ((globalThis as { __giltEarnings?: { at: number; snap: EarningsSnapshot | null } }).__giltEarnings ??= { at: 0, snap: null });

async function week(from: string, to: string, key: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${BASE}/calendar/earnings?from=${from}&to=${to}`, {
    headers: { "X-Finnhub-Token": key },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Finnhub rejected the API key");
  if (res.status === 429) throw new Error("Finnhub rate limit; try again in a minute");
  if (!res.ok) throw new Error(`Finnhub ${res.status}`);
  const body = (await res.json()) as { earningsCalendar?: Record<string, unknown>[] };
  return body.earningsCalendar ?? [];
}

/** Results from the last week and reports due in the next five weeks, for stocks on our list. */
export async function getEarnings(): Promise<EarningsSnapshot | null> {
  const key = finnhubKey();
  if (!key) return null;
  if (store.snap && !store.snap.error && Date.now() - store.at < CACHE_MS) return store.snap;
  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -7);
  const to = addDays(today, 35);
  try {
    const rows: Record<string, unknown>[] = [];
    for (let d = from; d <= to; d = addDays(d, 7)) rows.push(...(await week(d, addDays(d, 6), key)));
    const snap = { fetchedAt: new Date().toISOString(), from, to, events: matchEarnings(rows, STOCKS, US_LISTINGS) };
    store.snap = snap;
    store.at = Date.now();
    return snap;
  } catch (e) {
    // Keep showing the last good calendar if there is one.
    if (store.snap) return { ...store.snap, error: (e as Error).message };
    return { fetchedAt: new Date().toISOString(), from, to, events: [], error: (e as Error).message };
  }
}
