import type { NextRequest } from "next/server";
import { stockHistory } from "@/lib/stock-history";
import { yahooFor } from "@/lib/stocks";

/** GET /api/prices?symbol=LSE:BARC → five years of daily closes from Yahoo Finance. */
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
  return Response.json({ symbol, currency: h.currency, points: h.points });
}
