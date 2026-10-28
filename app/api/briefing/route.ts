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
  // One written in the last 5 minutes is reused, so double clicks don't pay twice.
  if (existing?.date === today && Date.now() - Date.parse(existing.generatedAt) < 5 * 60_000) return Response.json(existing);
  // Stream a space every few seconds while the briefing is written, so nothing between the
  // browser and the server drops a connection that looks idle; then the JSON result.
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const keepAlive = setInterval(() => controller.enqueue(enc.encode(" ")), 5000);
      try {
        controller.enqueue(enc.encode(JSON.stringify(await runOnce(() => generateBriefing(dataDir())))));
      } catch (e) {
        controller.enqueue(enc.encode(JSON.stringify({ error: (e as Error).message })));
      } finally {
        clearInterval(keepAlive);
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
