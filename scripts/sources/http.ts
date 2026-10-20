// Some official sites reject requests without a browser-like User-Agent.
const UA = "Mozilla/5.0 (compatible; gilt-monitor/0.1; +https://github.com/jackroyd7/gilt-monitor)";

export async function get(url: string, accept?: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, ...(accept ? { Accept: accept } : {}) },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) return res;
      lastErr = new Error(`${res.status} ${res.statusText} from ${url}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw lastErr;
}

export const getText = async (url: string, accept?: string) => (await get(url, accept)).text();
export const getBytes = async (url: string) => new Uint8Array(await (await get(url)).arrayBuffer());
