import { unitsPerPound } from "@/lib/fx-convert";
import { stockHistory } from "@/lib/stock-history";
import { returnSince, type Tip } from "@/lib/tips";

export const maxDuration = 60;

const BENCHMARK = "FOREXCOM:UKXGBP"; // FTSE 100

/**
 * POST /api/tips/performance { tips, symbols, since } → latest prices (with units per £1)
 * for the symbols held, each tip's move since it was published against the FTSE 100,
 * and the FTSE 100's move since the portfolio started.
 */
export async function POST(request: Request) {
  let body: { tips?: Tip[]; symbols?: string[]; since?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const tips = (Array.isArray(body.tips) ? body.tips : [])
    .filter((t) => t.symbol)
    .slice(-200);
  const symbols = [
    ...new Set([...(body.symbols ?? []), ...tips.map((t) => t.symbol!)]),
  ].slice(0, 120);
  const bench = (await stockHistory(BENCHMARK))?.points ?? [];
  const prices: Record<
    string,
    { price: number; currency?: string; perPound: number | null }
  > = {};
  const histories = new Map<string, [string, number][]>();
  let i = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (i < symbols.length) {
        const s = symbols[i++];
        const h = await stockHistory(s);
        if (!h) continue;
        histories.set(s, h.points);
        prices[s] = {
          price: h.price,
          currency: h.currency,
          perPound: await unitsPerPound(h.currency),
        };
      }
    }),
  );
  const tipReturns = Object.fromEntries(
    tips.map((t) => {
      const pts = histories.get(t.symbol!) ?? [];
      return [
        t.id,
        { since: returnSince(pts, t.week), ftse: returnSince(bench, t.week) },
      ];
    }),
  );
  return Response.json({
    prices,
    tipReturns,
    ftseSince: body.since ? returnSince(bench, body.since) : null,
  });
}
