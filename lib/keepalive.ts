// Long AI requests: send a space every few seconds so proxies don't time the request out,
// then the JSON result (or { error }). The client parses the trimmed body.
export function keepAliveJson(work: () => Promise<unknown>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const t = setInterval(() => controller.enqueue(enc.encode(" ")), 5000);
      try {
        controller.enqueue(enc.encode(JSON.stringify(await work())));
      } catch (e) {
        controller.enqueue(
          enc.encode(JSON.stringify({ error: (e as Error).message })),
        );
      } finally {
        clearInterval(t);
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
