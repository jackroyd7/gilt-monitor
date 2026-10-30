import type { NextRequest } from "next/server";
import { unitsPerPound } from "@/lib/fx-convert";
import { stockHistory } from "@/lib/stock-history";
import { yahooFor } from "@/lib/stocks";

/**
 * GET /api/prices?symbol=LSE:BARC → five years of daily closes from Yahoo Finance, the
 * latest price, and units of its currency per £1 (for valuing holdings in pounds).
 */
export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9_]+:[A-Z0-9._!-]+$/.test(symbol) || !yahooFor(symbol)) {
    return Response.json(
      { error: "We can't chart that instrument from Yahoo." },
      { status: 400 },
    );
  }
  const h = await stockHistory(symbol);
  if (!h)
    return Response.json(
      { error: "No price history available right now." },
      { status: 502 },
    );
  return Response.json({
    symbol,
    name: h.name,
    currency: h.currency,
    price: h.price,
    perPound: await unitsPerPound(h.currency),
    points: h.points,
  });
}
