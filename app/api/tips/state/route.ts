import { getPref, prefsConfigured, setPref } from "@/lib/prefs-store";

const KEY = "tips-portfolio";

/** The tips log and portfolio, shared across devices when Upstash Redis is connected. */
export async function GET() {
  if (!prefsConfigured()) return Response.json({ synced: false, state: null });
  try {
    return Response.json({ synced: true, state: await getPref(KEY) });
  } catch (e) {
    return Response.json(
      { synced: false, state: null, error: (e as Error).message },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request) {
  if (!prefsConfigured())
    return Response.json({ synced: false }, { status: 501 });
  const text = await request.text();
  if (text.length > 900_000)
    return Response.json({ error: "too large" }, { status: 413 });
  try {
    const state = JSON.parse(text) as { updatedAt?: unknown };
    if (!state || typeof state.updatedAt !== "string")
      return Response.json({ error: "invalid" }, { status: 400 });
    await setPref(KEY, state);
    return Response.json({ synced: true });
  } catch (e) {
    return Response.json(
      { synced: false, error: (e as Error).message },
      { status: 502 },
    );
  }
}
