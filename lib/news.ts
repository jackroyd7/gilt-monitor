// Pure helpers for the News tab: parse RSS/Atom, merge duplicates across topics, score
// relevance. No network here so it can be unit-tested.

import { XMLParser } from "fast-xml-parser";

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  published: string; // ISO
  topics: string[];
  score: number;
}

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") return text((v as Record<string, unknown>)["#text"] ?? "");
  return String(v);
};

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/** RSS 2.0 or Atom -> items. Google News titles end in " - Source", which we split off. */
export function parseFeed(xml: string, topic: string, fallbackSource = ""): NewsItem[] {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" }).parse(xml);
  const channel = doc?.rss?.channel ?? doc?.feed;
  if (!channel) return [];
  const raw = channel.item ?? channel.entry ?? [];
  const entries: Record<string, unknown>[] = Array.isArray(raw) ? raw : [raw];
  const feedTitle = decode(text(channel.title));
  const out: NewsItem[] = [];
  for (const e of entries) {
    let title = decode(text(e.title));
    const linkField = e.link as unknown;
    const url =
      typeof linkField === "string"
        ? linkField
        : Array.isArray(linkField)
          ? String((linkField[0] as Record<string, unknown>)?.["@href"] ?? "")
          : String((linkField as Record<string, unknown>)?.["@href"] ?? text(linkField));
    let source = decode(text(e.source));
    if (!source) {
      const m = title.match(/^(.*) - ([^-]{2,60})$/);
      if (m) [title, source] = [m[1], m[2]];
    } else if (title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3));
    }
    const when = new Date(text(e.pubDate ?? e.published ?? e.updated));
    if (!title || !url || isNaN(when.getTime())) continue;
    out.push({
      id: normaliseTitle(title),
      title,
      url: url.trim(),
      source: source || fallbackSource || feedTitle,
      published: when.toISOString(),
      topics: [topic],
      score: 0,
    });
  }
  return out;
}

export const normaliseTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Merges duplicates (same headline from several searches), keeping every topic tag. */
export function mergeItems(lists: NewsItem[][]): NewsItem[] {
  const byId = new Map<string, NewsItem>();
  for (const item of lists.flat()) {
    const prev = byId.get(item.id);
    if (!prev) byId.set(item.id, { ...item, topics: [...item.topics] });
    else for (const t of item.topics) if (!prev.topics.includes(t)) prev.topics.push(t);
  }
  return [...byId.values()].sort((a, b) => b.published.localeCompare(a.published));
}

/** Relevance: priority words in the headline, plus a bonus per topic matched, decaying with age. */
export function scoreItems(items: NewsItem[], priority: string[], now = Date.now()): NewsItem[] {
  return items.map((i) => {
    const t = i.title.toLowerCase();
    const hits = priority.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t)).length;
    const ageHours = Math.max(0, (now - Date.parse(i.published)) / 3_600_000);
    return { ...i, score: (2 * hits + i.topics.length) / (1 + ageHours / 24) };
  });
}

export const isMuted = (title: string, muted: string[]) => {
  const t = title.toLowerCase();
  return muted.some((w) => w.trim() && t.includes(w.trim().toLowerCase()));
};

export const googleNewsUrl = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:7d`)}&hl=en-GB&gl=GB&ceid=GB:en`;
