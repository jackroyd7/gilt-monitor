// Pure helpers for the in-app article reader: pull the readable text out of a page
// (Readability, the engine behind Firefox's reader view), spot paywalled sites, and
// refuse to fetch addresses that aren't ordinary public websites.

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export interface ArticleBlock {
  kind: "p" | "h" | "li" | "quote";
  text: string;
}

export interface ExtractedArticle {
  title: string;
  byline?: string;
  siteName?: string;
  excerpt?: string;
  blocks: ArticleBlock[];
  words: number;
}

/** Sites whose articles sit behind a paywall; we don't try to fetch them. */
export const PAYWALLED_DOMAINS = [
  "ft.com", "bloomberg.com", "thetimes.com", "thetimes.co.uk", "telegraph.co.uk", "wsj.com", "economist.com",
  "barrons.com", "nytimes.com", "spectator.co.uk", "newstatesman.com", "risk.net", "globalcapital.com",
  "ifre.com", "investorschronicle.co.uk", "thisismoney.co.uk/money/markets", "marketwatch.com",
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isPaywalled(url: string): boolean {
  const host = hostOf(url);
  return PAYWALLED_DOMAINS.some((d) => {
    const [domain] = d.split("/");
    return host === domain || host.endsWith(`.${domain}`);
  });
}

/** Only public http(s) sites: no IP literals, localhost or internal names. */
export function isFetchableUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith("[") || h.includes(":")) return false;
  return true;
}

/** Article text from a page's HTML, or null if no readable article is found. */
export function extractArticle(html: string, url: string): ExtractedArticle | null {
  const { document } = parseHTML(html);
  // Readability resolves relative links against the document URL.
  try {
    Object.defineProperty(document, "documentURI", { value: url });
  } catch {}
  const parsed = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
  if (!parsed?.content) return null;

  const { document: body } = parseHTML(`<!doctype html><html><body>${parsed.content}</body></html>`);
  const blocks: ArticleBlock[] = [];
  for (const el of body.querySelectorAll("p, h1, h2, h3, h4, li, blockquote")) {
    // Skip containers whose text is already captured by a nested element.
    if (el.tagName === "LI" && el.querySelector("p")) continue;
    if (el.tagName === "BLOCKQUOTE" && el.querySelector("p")) continue;
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 2) continue;
    const kind = /^H\d$/.test(el.tagName) ? "h" : el.tagName === "LI" ? "li" : el.closest("blockquote") ? "quote" : "p";
    if (blocks.length && blocks[blocks.length - 1].text === text) continue;
    blocks.push({ kind, text });
  }
  const words = blocks.reduce((n, b) => n + b.text.split(" ").length, 0);
  return {
    title: (parsed.title ?? "").trim(),
    byline: parsed.byline?.trim() || undefined,
    siteName: parsed.siteName?.trim() || undefined,
    excerpt: parsed.excerpt?.trim() || undefined,
    blocks,
    words,
  };
}

/** Plain text for summarising, capped so a huge page can't run up a big request. */
export function articleText(a: ExtractedArticle, maxChars = 40_000): string {
  return a.blocks
    .map((b) => (b.kind === "h" ? `## ${b.text}` : b.kind === "li" ? `- ${b.text}` : b.text))
    .join("\n\n")
    .slice(0, maxChars);
}

/**
 * Google News RSS links point at news.google.com/rss/articles/<id>. Older ids are
 * base64-encoded protobuf with the real URL inside; newer ones need a lookup (done by
 * the server fetcher). Returns the URL when it can be decoded locally.
 */
export function decodeGoogleNewsId(link: string): { id: string; url?: string } | null {
  const m = link.match(/news\.google\.com\/(?:rss\/)?(?:articles|read)\/([^?/#]+)/);
  if (!m) return null;
  const id = m[1];
  try {
    const bytes = Buffer.from(id.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
    const url = bytes.match(/https?:\/\/[\x21-\x7e]+/)?.[0];
    // New-style ids decode to an opaque token starting "AU_yqL" rather than a URL.
    if (url && !bytes.includes("AU_yqL")) return { id, url: url.replace(/[\x00-\x20"]+$/, "") };
  } catch {}
  return { id };
}

/** Parses Google's batchexecute reply for the decoded article URL. */
export function parseBatchExecute(body: string): string | null {
  for (const chunk of body.split("\n")) {
    if (!chunk.startsWith("[[")) continue;
    try {
      const outer = JSON.parse(chunk);
      for (const row of outer) {
        if (Array.isArray(row) && row[0] === "wrb.fr" && typeof row[2] === "string") {
          const inner = JSON.parse(row[2]);
          if (typeof inner?.[1] === "string" && inner[1].startsWith("http")) return inner[1];
        }
      }
    } catch {}
  }
  return null;
}
