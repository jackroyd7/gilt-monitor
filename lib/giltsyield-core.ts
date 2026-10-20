// Client for the giltsyield.com personal API (https://giltsyield.com/help/#api).
// Used by the web server (via lib/giltsyield.ts) and by the daily data job. The key
// only ever comes from the environment (Vercel / GitHub Actions secrets).

const BASE = (process.env.GILTSYIELD_BASE_URL ?? "https://giltsyield.com").replace(/\/$/, "");

import type { Row } from "./live-parse";

export { findKey, type Row } from "./live-parse";

export class GiltsYieldError extends Error {}

export function giltsYieldConfigured() {
  return Boolean(process.env.GILTSYIELD_API_KEY);
}

async function call(pathname: string, params: Record<string, string> = {}): Promise<unknown> {
  const key = process.env.GILTSYIELD_API_KEY;
  if (!key) throw new GiltsYieldError("GILTSYIELD_API_KEY is not set");
  const url = new URL(BASE + pathname);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { "X-API-Key": key, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new GiltsYieldError(`${res.status} ${res.statusText} from ${url.pathname}`);
  return res.json();
}

/** Unwraps common JSON envelopes ({results: [...]}, {data: [...]}, a bare array). */
export function asRows(body: unknown): Row[] {
  if (Array.isArray(body)) return body.filter((r) => r && typeof r === "object") as Row[];
  if (body && typeof body === "object") {
    for (const v of Object.values(body)) if (Array.isArray(v)) return asRows(v);
    return [body as Row];
  }
  return [];
}

const enc = encodeURIComponent;

export const giltsYield = {
  bonds: async () => asRows(await call("/api/bonds/")),
  /** Latest price, or the close on `date` (YYYY-MM-DD) when given. */
  bondPrice: async (ticker: string, date?: string) => {
    const row = asRows(await call(`/api/bond/price/${enc(ticker)}/${date ? `${enc(date)}/` : ""}`))[0];
    if (!row) throw new GiltsYieldError(`no price for ${ticker}${date ? ` on ${date}` : ""}`);
    return row;
  },
  portfolios: async () => asRows(await call("/api/portfolios/")),
  pl: async (p: string) => asRows(await call(`/api/portfolio/pl/${enc(p)}/`)),
  bookYield: async (p: string, lots = false) =>
    asRows(await call(`/api/portfolio/book-yield/${enc(p)}/`, lots ? { lots: "true" } : {})),
  trades: async (p: string) => asRows(await call(`/api/portfolio/trades/${enc(p)}/`)),
  upcomingFlows: async (p: string, inflation?: string) =>
    asRows(await call(`/api/portfolio/flows/upcoming/${enc(p)}/`, inflation ? { inflation } : {})),
};

/** Picks a portfolio's identifier and display name without knowing the exact field names. */
export function portfolioRef(r: Row): { id: string; name: string } {
  const get = (...keys: string[]) => {
    for (const k of Object.keys(r)) if (keys.includes(k.toLowerCase())) return r[k];
    return undefined;
  };
  const id = get("slug", "id", "pk", "portfolio_id", "key", "name");
  const name = get("name", "title", "label") ?? id;
  return { id: String(id ?? ""), name: String(name ?? "") };
}

