import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { articleText, decodeGoogleNewsId, extractArticle, hostOf, isFetchableUrl, isPaywalled, parseBatchExecute, type ExtractedArticle } from "./article";
import type { NewsItem } from "./news";

// Fetches an article for the in-app reader. Articles are looked up by the id of an item
// in the current news feed, never by a URL from the browser, so this can't be used to
// fetch arbitrary addresses. Results (and AI summaries) are cached in memory.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_BYTES = 3_000_000;

export type ArticleResult =
  | ({ status: "ok"; url: string } & ExtractedArticle)
  | { status: "paywalled" | "unavailable"; url: string; reason: string };

const store = ((globalThis as { __giltArticles?: { articles: Map<string, ArticleResult>; summaries: Map<string, string> } })
  .__giltArticles ??= { articles: new Map(), summaries: new Map() });

function remember<K, V>(map: Map<K, V>, key: K, value: V, max = 300) {
  map.set(key, value);
  if (map.size > max) map.delete(map.keys().next().value as K);
}

/** GET with redirects followed by hand, so every hop is checked against isFetchableUrl. */
async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    if (!isFetchableUrl(current)) throw new Error("address not allowed");
    const res = await fetch(current, {
      ...init,
      redirect: "manual",
      headers: { "User-Agent": UA, "Accept-Language": "en-GB,en;q=0.9", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("too many redirects");
}

async function readCapped(res: Response): Promise<string> {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error("page too large");
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new Error("page too large");
  return new TextDecoder().decode(buf);
}

/** Real article URL behind a Google News link (or the link itself if it isn't one). */
async function resolveUrl(link: string): Promise<string> {
  const g = decodeGoogleNewsId(link);
  if (!g) return link;
  if (g.url) return g.url;
  // New-style ids: read the signature from the article page, then ask Google to decode.
  const page = await readCapped(await safeFetch(`https://news.google.com/rss/articles/${g.id}`));
  const sig = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sig || !ts) throw new Error("couldn't read Google News link");
  const inner = JSON.stringify([
    "garturlreq",
    [["X", "X", ["X", "X"], null, null, 1, 1, "GB:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    g.id,
    Number(ts),
    sig,
  ]);
  const res = await safeFetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: `f.req=${encodeURIComponent(JSON.stringify([[["Fbv4je", inner, null, "generic"]]]))}`,
  });
  const url = parseBatchExecute(await res.text());
  if (!url) throw new Error("couldn't decode Google News link");
  return url;
}

export async function getArticle(item: NewsItem): Promise<ArticleResult> {
  const cached = store.articles.get(item.id);
  if (cached) return cached;
  let url = item.url;
  let result: ArticleResult;
  try {
    url = await resolveUrl(item.url);
    if (isPaywalled(url)) {
      result = { status: "paywalled", url, reason: `${hostOf(url)} is behind a paywall` };
    } else {
      const res = await safeFetch(url);
      if (!res.ok) throw new Error(`the site returned ${res.status}`);
      if (!(res.headers.get("content-type") ?? "").includes("html")) throw new Error("not a web page");
      const article = extractArticle(await readCapped(res), res.url || url);
      if (!article || article.words < 120) {
        result = { status: "paywalled", url, reason: "only a short preview is available (likely paywalled or subscriber-only)" };
      } else {
        result = { status: "ok", url, ...article };
      }
    }
  } catch (e) {
    result = { status: "unavailable", url, reason: (e as Error).message };
  }
  // Don't cache transient failures for long: they're retried on the next open.
  if (result.status !== "unavailable") remember(store.articles, item.id, result);
  return result;
}

// ---------------------------------------------------------------- AI summary

export const summariesEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.NEWS_SUMMARIES !== "off";

const SYSTEM = `You read news articles for a UK-based investor who follows gilts and UK rates, sterling and other FX, global government bonds, equities and commodities, and you explain which markets the news matters for and why.
Write in British English, plainly, without hype. Take facts only from the article; your market reasoning is your own analysis, so keep it measured and say when an effect is uncertain or depends on how things develop.
Format:
- First line: "In short:" and one sentence on what happened.
- Then "Markets affected:" followed by one bullet per market, most affected first, each as "<market>: <why it matters, and the likely direction if the article gives grounds for one>". Be specific (e.g. "Short-dated gilts", "GBP/USD", "FTSE 100 miners", "Brent crude") rather than generic.
- Include only markets with a real link to the story, usually one to four. If the story has no meaningful market impact, say so in a single line instead of listing markets.`;

export async function summarise(item: NewsItem, article: Extract<ArticleResult, { status: "ok" }>): Promise<string> {
  const cached = store.summaries.get(item.id);
  if (cached) return cached;
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    // A short summary doesn't need deep reasoning; low effort keeps it quick and cheap.
    output_config: { effort: "low" },
    // If a safety classifier declines, the API retries on a suitable fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Headline: ${item.title}\nSource: ${item.source}\nPublished: ${item.published}\n\n${articleText(article)}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("the model declined to summarise this article");
  const text = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();
  if (!text) throw new Error("empty summary");
  remember(store.summaries, item.id, text);
  return text;
}
