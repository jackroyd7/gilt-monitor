import "server-only";

// Small key-value store for preferences that should follow you across devices (e.g. the
// Markets layout). Uses Upstash Redis over its REST API, connected through Vercel's
// storage marketplace, which sets KV_REST_API_URL / KV_REST_API_TOKEN (or the
// UPSTASH_REDIS_REST_* equivalents). Without them, prefsConfigured() is false and
// callers fall back to per-browser storage.

const PREFIX = "gilt-monitor:";

function creds() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const prefsConfigured = () => creds() != null;

async function call(path: string, body?: string): Promise<unknown> {
  const c = creds();
  if (!c) throw new Error("preference storage is not configured");
  const res = await fetch(`${c.url}${path}`, {
    method: body == null ? "GET" : "POST",
    headers: { Authorization: `Bearer ${c.token}` },
    body,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`preference storage returned ${res.status}`);
  return ((await res.json()) as { result?: unknown }).result;
}

export async function getPref<T>(key: string): Promise<T | null> {
  const raw = await call(`/get/${encodeURIComponent(PREFIX + key)}`);
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setPref(key: string, value: unknown): Promise<void> {
  if (value == null) await call(`/del/${encodeURIComponent(PREFIX + key)}`);
  else await call(`/set/${encodeURIComponent(PREFIX + key)}`, JSON.stringify(value));
}
