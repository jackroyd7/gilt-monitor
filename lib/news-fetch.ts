import "server-only";
import { MUTED_WORDS, NEWS_TOPICS, PRIORITY_WORDS } from "@/config/news";
import { googleNewsUrl, isMuted, mergeItems, parseFeed, scoreItems, type NewsItem } from "./news";

// Fetches every topic's searches and feeds on request, cached for CACHE_MS in a
// process-wide store (shared by all routes, like the live gilt prices).
const CACHE_MS = Number(process.env.NEWS_CACHE_SECONDS ?? 600) * 1000;
const MAX_AGE_DAYS = 7;

export interface NewsSnapshot {
  fetchedAt: string;
  items: NewsItem[];
  failures: string[];
}

const store = ((globalThis as { __giltNews?: { at: number; snap: NewsSnapshot | null; inflight: Promise<NewsSnapshot> | null } })
  .__giltNews ??= { at: 0, snap: null, inflight: null });

async function fetchFeed(url: string, topic: string, source?: string): Promise<NewsItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; gilt-monitor)", Accept: "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}`);
  return parseFeed(await res.text(), topic, source);
}

async function load(): Promise<NewsSnapshot> {
  const jobs = NEWS_TOPICS.flatMap((t) => [
    ...t.queries.map((q) => ({ label: `${t.label}: ${q}`, run: () => fetchFeed(googleNewsUrl(q), t.id) })),
    ...(t.feeds ?? []).map((f) => ({ label: `${t.label}: ${f}`, run: () => fetchFeed(f, t.id) })),
  ]);
  const results = await Promise.allSettled(jobs.map((j) => j.run()));
  const failures = results.flatMap((r, i) => (r.status === "rejected" ? [`${jobs[i].label} (${(r.reason as Error).message})`] : []));
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const items = scoreItems(
    mergeItems(results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))).filter(
      (i) => Date.parse(i.published) >= cutoff && !isMuted(i.title, MUTED_WORDS),
    ),
    PRIORITY_WORDS,
  ).slice(0, 400);
  return { fetchedAt: new Date().toISOString(), items, failures };
}

/** Cached news; never throws. */
export async function getNews(opts: { force?: boolean } = {}): Promise<NewsSnapshot> {
  if (!opts.force && store.snap && Date.now() - store.at < CACHE_MS) return store.snap;
  store.inflight ??= load()
    .then((snap) => {
      // If everything failed, keep showing the last good set.
      if (!snap.items.length && store.snap?.items.length) return { ...store.snap, failures: snap.failures };
      store.snap = snap;
      store.at = Date.now();
      return snap;
    })
    .finally(() => {
      store.inflight = null;
    });
  return store.inflight;
}
