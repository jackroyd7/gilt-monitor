import type { NextRequest } from "next/server";
import { addDays, latestDate } from "@/lib/curve";
import { loadMarket, loadRates } from "@/lib/data";
import { SPREAD_MENU, spreadSeries } from "@/lib/rates-spreads";

/** GET /api/rates/series?ids=a,b,c → { [id]: [date, value][] } for the Rates tab's charts. */
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .filter((id) => SPREAD_MENU.some((m) => m.id === id))
    .slice(0, 24);
  const [{ curves }, rates] = await Promise.all([loadMarket(), loadRates()]);
  const since = addDays(latestDate(curves.uk_nominal) ?? new Date().toISOString().slice(0, 10), -2 * 365);
  return Response.json(Object.fromEntries(ids.map((id) => [id, spreadSeries(id, curves, rates, since)])), {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
