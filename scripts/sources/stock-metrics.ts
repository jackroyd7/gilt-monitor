import { STOCKS } from "../../config/stock-catalogue";
import {
  parseQuoteSummary,
  type StockMetricsFile,
} from "../../lib/stock-metrics";
import { yahooSymbol } from "../../lib/stocks";

// Yahoo's quote summary needs a session cookie and a matching "crumb" token, which any
// visitor to the site gets. Fetched once a day: valuation multiples don't move much intraday.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MODULES = "price,summaryDetail,defaultKeyStatistics,financialData";
const REFRESH_MS = 20 * 3600_000;

async function session(): Promise<{ cookie: string; crumb: string }> {
  const notes: string[] = [];
  for (const url of [
    "https://fc.yahoo.com/",
    "https://finance.yahoo.com/quote/AAPL/",
    "https://login.yahoo.com/",
  ]) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      const cookie = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .filter(Boolean)
        .join("; ");
      if (!cookie) {
        notes.push(`${new URL(url).host} ${res.status} no cookie`);
        continue;
      }
      for (const host of ["query1", "query2"]) {
        const c = await fetch(
          `https://${host}.finance.yahoo.com/v1/test/getcrumb`,
          {
            headers: { "User-Agent": UA, Cookie: cookie, Accept: "*/*" },
            signal: AbortSignal.timeout(20_000),
          },
        );
        const crumb = (await c.text()).trim();
        if (c.ok && crumb && !crumb.includes("<") && crumb.length < 40)
          return { cookie, crumb };
        notes.push(`${host} crumb ${c.status}`);
      }
    } catch (e) {
      notes.push(`${new URL(url).host} ${(e as Error).message.slice(0, 30)}`);
    }
  }
  throw new Error(`couldn't get a Yahoo session (${notes.join("; ")})`);
}

export async function fetchStockMetrics(
  previous: StockMetricsFile | undefined,
  force = false,
) {
  if (
    !force &&
    previous &&
    Date.now() - Date.parse(previous.updatedAt) < REFRESH_MS
  ) {
    return {
      data: previous,
      ok: Object.keys(previous.stocks).length,
      total: STOCKS.length,
      skipped: true,
    };
  }
  const { cookie, crumb } = await session();
  const stocks: StockMetricsFile["stocks"] = { ...(previous?.stocks ?? {}) };
  const asOf = new Date().toISOString();
  const failed: string[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < STOCKS.length) {
        const s = STOCKS[next++];
        const y = yahooSymbol(s.symbol);
        if (!y) continue;
        try {
          const res = await fetch(
            `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(y)}?modules=${MODULES}&crumb=${encodeURIComponent(crumb)}`,
            {
              headers: {
                "User-Agent": UA,
                Cookie: cookie,
                Accept: "application/json",
              },
              signal: AbortSignal.timeout(20_000),
            },
          );
          if (!res.ok) throw new Error(String(res.status));
          const m = parseQuoteSummary(await res.json(), asOf);
          if (!m) throw new Error("empty");
          stocks[s.symbol] = m;
        } catch (e) {
          failed.push(`${y} (${(e as Error).message.slice(0, 30)})`);
        }
      }
    }),
  );
  if (failed.length)
    console.log(
      `  ${failed.length} stocks failed: ${failed.slice(0, 30).join(", ")}${failed.length > 30 ? "…" : ""}`,
    );
  return {
    data: { updatedAt: asOf, stocks } as StockMetricsFile,
    ok: STOCKS.length - failed.length,
    total: STOCKS.length,
    skipped: false,
  };
}
