import { STOCKS } from "../../config/stock-catalogue";
import { parseYahooChart, yahooSymbol, type StockQuotes } from "../../lib/stocks";
import { getText } from "./http";

// Markets whose stocks TradingView's free widgets can't show; US stocks are left to them.
const GROUPS = new Set(["UK stocks", "German stocks", "French stocks", "Asian stocks"]);

/** One small request per stock, four at a time; a failed stock keeps its previous quote. */
export async function fetchStockQuotes(previous: StockQuotes | undefined) {
  const quotes: StockQuotes["quotes"] = { ...(previous?.quotes ?? {}) };
  const list = STOCKS.filter((s) => GROUPS.has(s.group));
  const failed: string[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < list.length) {
        const s = list[next++];
        const y = yahooSymbol(s.symbol);
        if (!y) continue;
        try {
          const q = parseYahooChart(JSON.parse(await getText(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?range=5d&interval=1d`, "application/json")));
          if (!q) throw new Error("no prices");
          quotes[s.symbol] = q;
        } catch (e) {
          failed.push(`${y} (${(e as Error).message.slice(0, 40)})`);
        }
      }
    }),
  );
  if (failed.length) console.log(`  ${failed.length} stocks failed: ${failed.slice(0, 30).join(", ")}${failed.length > 30 ? "…" : ""}`);
  return { data: { updatedAt: new Date().toISOString(), quotes } as StockQuotes, ok: list.length - failed.length, total: list.length };
}
