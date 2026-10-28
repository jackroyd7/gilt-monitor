import path from "node:path";
import { londonClock } from "@/lib/briefing";
import { anthropicKey, generateBriefing } from "@/lib/briefing-gen";
import { latestBriefing, runOnce } from "@/lib/briefing-store";

export const maxDuration = 300;

/**
 * Called by the Vercel cron in vercel.json on weekday mornings. Writes at most one briefing
 * per London day. With CRON_SECRET set in Vercel, only Vercel's cron (which sends it) can call it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorised", { status: 401 });
  if (!anthropicKey()) return Response.json({ skipped: "ANTHROPIC_API_KEY is not set" });
  const today = londonClock().date;
  if ((await latestBriefing())?.date === today) return Response.json({ skipped: "already written today" });
  try {
    const b = await runOnce(() => generateBriefing(path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR ?? "data")));
    return Response.json({ written: b.generatedAt });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
