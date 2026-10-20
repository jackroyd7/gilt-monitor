import type { NextRequest } from "next/server";
import { loadGiltHistory } from "@/lib/data";
import { giltSeries, londonNow } from "@/lib/history";
import { getLive } from "@/lib/live";

/**
 * Price and yield history for up to four gilts: /api/history?isin=GB...&isin=GB...
 * Today's intraday price is appended when giltsyield.com is connected.
 */
export async function GET(request: NextRequest) {
  const isins = request.nextUrl.searchParams.getAll("isin").slice(0, 4);
  const [hist, live] = await Promise.all([loadGiltHistory(), getLive()]);
  const today = live ? londonNow(new Date(live.fetchedAt)).date : undefined;
  const out: Record<string, { name: string; type: string; points: [string, number | null, number | null][] }> = {};
  for (const isin of isins) {
    const meta = hist?.gilts[isin];
    const points = giltSeries(hist, isin);
    const l = live?.gilts.find((g) => g.isin === isin);
    if (l && today && (l.yield != null || l.cleanPrice != null)) {
      if (points.length && points[points.length - 1][0] === today) points.pop();
      points.push([today, l.cleanPrice, l.yield]);
    }
    out[isin] = { name: meta?.name ?? l?.name ?? isin, type: meta?.type ?? l?.type ?? "conventional", points };
  }
  return Response.json(out);
}
