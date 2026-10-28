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

// One-off searches (e.g. news on a single company), cached per query like the main feed.
type QueryCache = Map<string, { at: number; items: NewsItem[] }>;
const queries = ((globalThis as { __giltQueryNews?: QueryCache }).__giltQueryNews ??= new Map() as QueryCache);

/** Last week's Google News results for one search; never throws. */
export async function getQueryNews(query: string, topic = "search"): Promise<NewsItem[]> {
  const hit = queries.get(query);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;
  try {
    const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
    const items = mergeItems([await fetchFeed(googleNewsUrl(query), topic)])
      .filter((i) => Date.parse(i.published) >= cutoff)
      .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
      .slice(0, 30);
    if (queries.size > 200) queries.clear();
    queries.set(query, { at: Date.now(), items });
    return items;
  } catch {
    return hit?.items ?? [];
  }
}

/** A news item shown anywhere on the site, by id (the reader popup looks items up this way). */
export async function findNewsItem(id: string): Promise<NewsItem | undefined> {
  for (const q of queries.values()) {
    const item = q.items.find((i) => i.id === id);
    if (item) return item;
  }
  return (await getNews()).items.find((i) => i.id === id);
}
