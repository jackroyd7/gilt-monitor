import "server-only";

// Client for the giltsyield.com personal API (https://giltsyield.com/help/#api).
// The key only ever lives in the server environment; responses are rendered on the
// server and never written to disk or the repo.

const BASE = (process.env.GILTSYIELD_BASE_URL ?? "https://giltsyield.com").replace(/\/$/, "");

export type Row = Record<string, unknown>;

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
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
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

/** Finds the column whose name matches, case-insensitively. */
export function findKey(rows: Row[], ...patterns: RegExp[]): string | undefined {
  const keys = Object.keys(rows[0] ?? {});
  for (const p of patterns) {
    const k = keys.find((key) => p.test(key));
    if (k) return k;
  }
  return undefined;
}
