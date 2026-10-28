import { ask } from "@/lib/ask";

export const maxDuration = 120;

/** POST /api/ask { page, question } → { text, sources } (signed-in users only, via the site password). */
export async function POST(request: Request) {
  let body: { page?: unknown; question?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const page = typeof body.page === "string" && body.page.startsWith("/") ? body.page.slice(0, 80) : "/";
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 300) : "";
  if (question.length < 3) return Response.json({ error: "Type a question first." }, { status: 400 });
  // Keep-alive spaces while the model works (searches can take a little while), then JSON.
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const t = setInterval(() => controller.enqueue(enc.encode(" ")), 5000);
      try {
        controller.enqueue(enc.encode(JSON.stringify(await ask(page, question))));
      } catch (e) {
        controller.enqueue(enc.encode(JSON.stringify({ error: (e as Error).message })));
      } finally {
        clearInterval(t);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
