// Session cookie for the site password. The cookie holds a hash of the password rather
// than the password itself; changing DASHBOARD_PASSWORD signs everyone out.
export const AUTH_COOKIE = "gm_session";

export async function sessionToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`gilt-monitor-session:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
