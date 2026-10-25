import type { NextRequest } from "next/server";
import { sanitizeLayout } from "@/lib/market-layout";
import { getPref, prefsConfigured, setPref } from "@/lib/prefs-store";

const KEY = "markets-layout";

/** The Markets card layout shared across devices: { synced, layout }. */
export async function GET() {
  if (!prefsConfigured()) return Response.json({ synced: false, layout: null });
  try {
    return Response.json({ synced: true, layout: sanitizeLayout(await getPref(KEY)) });
  } catch (e) {
    return Response.json({ synced: false, layout: null, error: (e as Error).message }, { status: 502 });
  }
}

/** Saves the layout (body: the layout, or null to go back to defaults). */
export async function PUT(request: NextRequest) {
  if (!prefsConfigured()) return Response.json({ synced: false }, { status: 501 });
  const text = await request.text();
  if (text.length > 20_000) return Response.json({ error: "layout too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const layout = body === null ? null : sanitizeLayout(body);
  if (body !== null && !layout) return Response.json({ error: "invalid layout" }, { status: 400 });
  try {
    await setPref(KEY, layout);
    return Response.json({ synced: true });
  } catch (e) {
    return Response.json({ synced: false, error: (e as Error).message }, { status: 502 });
  }
}
