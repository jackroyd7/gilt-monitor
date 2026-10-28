"use client";

import { useState } from "react";
import type { NewsItem } from "@/lib/news";
import ArticleModal from "./ArticleModal";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit" });

/** A short list of headlines that open in the reader popup. */
export default function HeadlineList({ items, empty = "No headlines in the last week." }: { items: NewsItem[]; empty?: string }) {
  const [open, setOpen] = useState<NewsItem | null>(null);
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <>
      <ul className="divide-y divide-[color:var(--border)]">
        {items.map((i) => (
          <li key={i.id}>
            <button onClick={() => setOpen(i)} className="block w-full py-2 text-left hover:text-accent">
              <span className="text-sm text-ink">{i.title}</span>
              <span className="mt-0.5 block text-xs text-muted">
                {i.source} · {when(i.published)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open && <ArticleModal item={open} topicLabel={() => ""} onClose={() => setOpen(null)} />}
    </>
  );
}
