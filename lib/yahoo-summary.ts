import "server-only";
import { parseYahooSummary, type YahooSummary } from "./yahoo-parse";

// Yahoo Finance's quote summary (valuation, profile, analysts, earnings) for listings
// Finnhub's free plan doesn't cover, such as London. It needs a session cookie and a
// matching "crumb" token, as any visitor to the site gets; both are cached. Yahoo
// rate-limits some cloud servers, in which case this returns null with the reason.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MODULES =
  "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile,recommendationTrend,earningsHistory,calendarEvents";
const SUMMARY_MS = 6 * 3600_000;
const SESSION_MS = 3600_000;
// After a refusal, don't keep knocking for a while.
const BACKOFF_MS = 15 * 60_000;

type State = {
  session?: { cookie: string; crumb: string; at: number };
  blockedUntil?: number;
  lastError?: string;
  summaries: Map<string, { at: number; s: YahooSummary | null }>;
};
const state = ((globalThis as { __giltYahoo?: State }).__giltYahoo ??= {
  summaries: new Map() as State["summaries"],
});

async function session(): Promise<{ cookie: string; crumb: string } | null> {
  if (state.session && Date.now() - state.session.at < SESSION_MS)
    return state.session;
  if (state.blockedUntil && Date.now() < state.blockedUntil) return null;
  const notes: string[] = [];
  for (const url of ["https://fc.yahoo.com/", "https://finance.yahoo.com/"]) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
      });
      const cookie = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .filter(Boolean)
        .join("; ");
      if (!cookie) {
        notes.push(`${new URL(url).host} gave no cookie`);
        continue;
      }
      const c = await fetch(
        "https://query2.finance.yahoo.com/v1/test/getcrumb",
        {
          headers: { "User-Agent": UA, Cookie: cookie },
          signal: AbortSignal.timeout(6000),
        },
      );
      const crumb = (await c.text()).trim();
      if (c.ok && crumb && !crumb.includes("<") && crumb.length < 40) {
        state.session = { cookie, crumb, at: Date.now() };
        state.lastError = undefined;
        return state.session;
      }
      notes.push(`crumb ${c.status}`);
    } catch (e) {
      notes.push((e as Error).message.slice(0, 40));
    }
  }
  state.blockedUntil = Date.now() + BACKOFF_MS;
  state.lastError = `Yahoo refused (${notes.join("; ")})`;
  return null;
}

/** Quote summary for a Yahoo ticker ("LLOY.L"), or null. */
export async function yahooSummary(
  ticker: string,
): Promise<YahooSummary | null> {
  const hit = state.summaries.get(ticker);
  if (hit && Date.now() - hit.at < SUMMARY_MS) return hit.s;
  for (let attempt = 0; attempt < 2; attempt++) {
    const sess = await session();
    if (!sess) return hit?.s ?? null;
    try {
      const res = await fetch(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${MODULES}&crumb=${encodeURIComponent(sess.crumb)}`,
        {
          headers: {
            "User-Agent": UA,
            Cookie: sess.cookie,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (res.status === 401 || res.status === 403) {
        state.session = undefined; // stale crumb: get a new one and retry once
        continue;
      }
      if (res.status === 429) {
        state.blockedUntil = Date.now() + BACKOFF_MS;
        state.lastError = "Yahoo rate-limited the request (429)";
        return hit?.s ?? null;
      }
      if (!res.ok) {
        state.lastError = `Yahoo ${res.status}`;
        return hit?.s ?? null;
      }
      const s = parseYahooSummary(await res.json());
      if (state.summaries.size > 500) state.summaries.clear();
      state.summaries.set(ticker, { at: Date.now(), s });
      return s;
    } catch (e) {
      state.lastError = `Yahoo: ${(e as Error).message.slice(0, 40)}`;
      return hit?.s ?? null;
    }
  }
  return hit?.s ?? null;
}

/** Why the last Yahoo request failed, for the page footnote. */
export const yahooError = () => state.lastError;
