import type { NextRequest } from "next/server";
import { searchListings } from "@/lib/symbol-resolve";

/** GET /api/search?q=barclays → listings worldwide: our own list first, then Yahoo or Finnhub search. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 1) return Response.json({ results: [] });
  return Response.json({ results: await searchListings(q) });
}
