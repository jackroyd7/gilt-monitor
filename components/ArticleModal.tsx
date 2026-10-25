"use client";

import { useEffect, useState } from "react";
import type { ArticleBlock } from "@/lib/article";
import type { NewsItem } from "@/lib/news";
import Modal from "./Modal";

type ArticleResponse =
  | { status: "ok"; url: string; title: string; byline?: string; siteName?: string; blocks: ArticleBlock[]; words: number; summaries: boolean }
  | { status: "paywalled" | "unavailable"; url: string; reason: string; summaries: boolean }
  | { error: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** In-app reader: article text for free-to-read sources, otherwise headline and a link out. */
export default function ArticleModal({ item, topicLabel, onClose }: { item: NewsItem; topicLabel: (id: string) => string; onClose: () => void }) {
  const [data, setData] = useState<ArticleResponse | null>(null);
  const [summary, setSummary] = useState<{ text?: string; error?: string; loading?: boolean }>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/article?id=${encodeURIComponent(item.id)}`)
      .then((r) => r.json())
      .then((d: ArticleResponse) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ error: "Couldn't load the article." }));
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  const summarise = () => {
    setSummary({ loading: true });
    fetch(`/api/article/summary?id=${encodeURIComponent(item.id)}`, { method: "POST" })
      .then((r) => r.json())
      .then((d: { summary?: string; error?: string }) => setSummary(d.summary ? { text: d.summary } : { error: d.error ?? "Summary failed." }))
      .catch(() => setSummary({ error: "Summary failed." }));
  };

  const url = data && "url" in data ? data.url : item.url;
  const ok = data && "status" in data && data.status === "ok" ? data : null;
  // Whether the server has an Anthropic key (known once the article request returns).
  const aiOn = data && "summaries" in data ? data.summaries : null;

  return (
    <Modal
      title={item.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-ink-2">{ok?.siteName ?? item.source}</span>
          <span>{when(item.published)}</span>
          {ok?.byline && <span>{ok.byline}</span>}
          {item.topics.map((t) => (
            <span key={t} className="rounded bg-surface-2 px-1.5 py-px text-[11px] text-ink-2">
              {topicLabel(t)}
            </span>
          ))}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink hover:bg-surface">
            Open original ↗
          </a>
          {aiOn && !summary.text && (
            <button
              onClick={summarise}
              disabled={summary.loading}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-ink hover:bg-surface-2 disabled:opacity-60"
            >
              {summary.loading ? "Analysing…" : ok ? "Market impact" : "Market impact (from headline)"}
            </button>
          )}
          {aiOn === false && (
            <span className="text-xs text-muted" title="Add ANTHROPIC_API_KEY in Vercel (Production) and redeploy">
              Market impact needs ANTHROPIC_API_KEY
            </span>
          )}
          {ok && <span className="ml-auto text-xs text-muted">Reader view · {ok.words.toLocaleString("en-GB")} words</span>}
        </>
      }
    >
      {!data && <p className="py-10 text-center text-sm text-muted">Loading article…</p>}
      {data && "error" in data && <p className="py-6 text-sm text-ink-2">{data.error}</p>}
      {data && "status" in data && data.status !== "ok" && (
        <div className="space-y-2 py-4 text-sm text-ink-2">
          <p className="font-medium text-ink">{data.status === "paywalled" ? "Full text isn't available here." : "Couldn't fetch this article."}</p>
          <p>Reason: {data.reason}.</p>
          <p>Use “Open original” to read it on the publisher’s site.</p>
        </div>
      )}
      {(summary.text || summary.error) && (
        <div className="mb-4 rounded-md border border-line bg-surface-2 px-4 py-3 text-sm">
          <div className="mb-1 text-xs font-semibold text-ink-2">Market impact (AI analysis)</div>
          {summary.error ? (
            <p style={{ color: "var(--critical)" }}>{summary.error}</p>
          ) : (
            <div className="space-y-1 whitespace-pre-wrap text-ink">{summary.text}</div>
          )}
        </div>
      )}
      {ok && (
        <article className="space-y-3 text-[15px] leading-relaxed text-ink">
          {ok.blocks.map((b, i) =>
            b.kind === "h" ? (
              <h3 key={i} className="pt-2 text-base font-semibold">
                {b.text}
              </h3>
            ) : b.kind === "li" ? (
              <p key={i} className="pl-4 before:-ml-3 before:mr-1.5 before:content-['•']">
                {b.text}
              </p>
            ) : b.kind === "quote" ? (
              <blockquote key={i} className="border-l-2 border-line pl-3 text-ink-2 italic">
                {b.text}
              </blockquote>
            ) : (
              <p key={i}>{b.text}</p>
            ),
          )}
        </article>
      )}
    </Modal>
  );
}
