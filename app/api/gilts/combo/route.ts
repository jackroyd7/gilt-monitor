import type { NextRequest } from "next/server";
import { loadGiltHistory } from "@/lib/data";
import { changeSince, combo, yieldHistories, zScore } from "@/lib/rv";

const short = (n: string) => n.replace(/Treasury (Gilt|Stock)\s*/i, "").replace(/\s+/g, " ").trim();

/**
 * GET /api/gilts/combo?legs=ISIN1,ISIN2[,ISIN3] → a switch (leg2 − leg1) or butterfly
 * (2 × leg2 − leg1 − leg3) in bp from the daily gilt history, with z-scores.
 */
export async function GET(request: NextRequest) {
  const legs = (request.nextUrl.searchParams.get("legs") ?? "").split(",").filter((x) => /^[A-Z]{2}[A-Z0-9]{10}$/.test(x));
  if (legs.length !== 2 && legs.length !== 3) return Response.json({ error: "Pick two gilts for a switch or three for a butterfly." }, { status: 400 });
  const hist = await loadGiltHistory();
  if (!hist) return Response.json({ error: "No gilt history yet." }, { status: 404 });
  const ys = yieldHistories(hist);
  if (legs.some((l) => !ys.get(l)?.length)) return Response.json({ error: "No yield history for one of those gilts." }, { status: 404 });
  const weights = legs.length === 2 ? [-1, 1] : [-1, 2, -1];
  const series = combo(legs.map((l, i) => ({ series: ys.get(l)!, weight: weights[i] })));
  if (series.length < 2) return Response.json({ error: "Not enough overlapping history." }, { status: 404 });
  const names = legs.map((l) => short(hist.gilts[l]?.name ?? l));
  return Response.json({
    id: legs.join("-"),
    label: legs.length === 2 ? `${names[0]} → ${names[1]}` : `${names[0]} / ${names[1]} / ${names[2]}`,
    value: series.at(-1)![1],
    chg1m: changeSince(series, 31),
    z3m: zScore(series, 63),
    z1y: zScore(series, 252),
    series,
    custom: true,
  });
}
