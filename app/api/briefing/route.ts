import path from "node:path";
import { londonClock } from "@/lib/briefing";
import { anthropicKey, generateBriefing } from "@/lib/briefing-gen";
import { latestBriefing, runOnce } from "@/lib/briefing-store";

// Writing a briefing takes one to three minutes (several web searches).
export const maxDuration = 300;

const dataDir = () => path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR ?? "data");

/** POST /api/briefing: write today's briefing now (signed-in users only, via the site password). */
export async function POST() {
  if (!anthropicKey()) return Response.json({ error: "ANTHROPIC_API_KEY is not set in Vercel." }, { status: 400 });
  const today = londonClock().date;
  const existing = await latestBriefing();
  // A fresh one written in the last 20 minutes is reused, so double clicks don't pay twice.
  if (existing?.date === today && Date.now() - Date.parse(existing.generatedAt) < 20 * 60_000) return Response.json(existing);
  try {
    return Response.json(await runOnce(() => generateBriefing(dataDir())));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
