"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { refreshNews } from "@/app/actions";
import type { NewsItem } from "@/lib/news";
import { isMuted } from "@/lib/news";

const MUTE_KEY = "gilt-monitor:muted-words";

const ukTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
const ukDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" });

export default function NewsFeed({
  items,
  topics,
  fetchedAt,
  failures,
}: {
  items: NewsItem[];
  topics: { id: string; label: string }[];
  fetchedAt: string;
  failures: string[];
}) {
  const [active, setActive] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"latest" | "relevant">("latest");
  const [muted, setMuted] = useState<string[]>([]);
  const [muteInput, setMuteInput] = useState("");
  const [pending, start] = useTransition();

  // Muted words are a per-browser preference.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(MUTE_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of a saved preference
      if (Array.isArray(saved)) setMuted(saved);
    } catch {}
  }, []);
  const saveMuted = (next: string[]) => {
    setMuted(next);
    try {
      localStorage.setItem(MUTE_KEY, JSON.stringify(next));
    } catch {}
  };

  const label = useMemo(() => Object.fromEntries(topics.map((t) => [t.id, t.label])), [topics]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of items) for (const t of i.topics) c[t] = (c[t] ?? 0) + 1;
    return c;
  }, [items]);

  const shown = useMemo(() => {
    const ql = q.toLowerCase();
    const list = items.filter(
      (i) =>
        (!active.length || i.topics.some((t) => active.includes(t))) &&
        (!ql || i.title.toLowerCase().includes(ql) || i.source.toLowerCase().includes(ql)) &&
        !isMuted(i.title, muted),
    );
    return sort === "relevant" ? [...list].sort((a, b) => b.score - a.score) : list;
  }, [items, active, q, muted, sort]);

  const toggleTopic = (id: string) => setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  return (
    <div className="space-y-4">
      <section className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setActive([])}
            className={`rounded-full border border-line px-3 py-1 ${!active.length ? "bg-surface-2 font-medium text-ink" : "text-ink-2"}`}
          >
            All topics
          </button>
          {topics.map((t) => (
            <button
              key={t.id}
              onClick={() => toggleTopic(t.id)}
              aria-pressed={active.includes(t.id)}
              className={`rounded-full border border-line px-3 py-1 ${active.includes(t.id) ? "bg-surface-2 font-medium text-ink" : "text-ink-2"}`}
            >
              {t.label} <span className="text-muted">{counts[t.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search headlines or sources"
            className="w-56 rounded-md border border-line bg-surface px-2 py-1 text-ink"
          />
          <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5">
            {(["latest", "relevant"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`rounded px-2.5 py-0.5 ${sort === s ? "bg-surface text-ink shadow-sm" : "text-ink-2"}`}
                title={s === "relevant" ? "Ranks gilt, BoE, fiscal and inflation headlines first, favouring recent ones" : undefined}
              >
                {s === "latest" ? "Latest" : "Most relevant"}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const w = muteInput.trim();
              if (w && !muted.includes(w)) saveMuted([...muted, w]);
              setMuteInput("");
            }}
          >
            <input
              value={muteInput}
              onChange={(e) => setMuteInput(e.target.value)}
              placeholder="Mute a word…"
              className="w-32 rounded-md border border-line bg-surface px-2 py-1 text-ink"
            />
          </form>
          {muted.map((w) => (
            <button
              key={w}
              onClick={() => saveMuted(muted.filter((x) => x !== w))}
              className="rounded-full border border-line px-2 py-0.5 text-ink-2"
              title="Unmute"
            >
              {w} ✕
            </button>
          ))}
          <span className="ml-auto text-muted">
            {shown.length} articles · updated {ukTime(fetchedAt)}
            {failures.length > 0 && (
              <span title={failures.join("\n")} style={{ color: "var(--critical)" }}>
                {" "}
                · {failures.length} feed{failures.length > 1 ? "s" : ""} failed
              </span>
            )}
          </span>
          <button
            onClick={() => start(() => refreshNews())}
            disabled={pending}
            className="rounded-md border border-line bg-surface-2 px-2.5 py-1 text-ink disabled:opacity-60"
          >
            {pending ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>

      <section className="card p-4">
        {!shown.length && <p className="py-8 text-center text-sm text-muted">No articles match.</p>}
        <ul className="divide-y divide-[color:var(--border)]">
          {shown.map((i, idx) => {
            const day = ukDay(i.published);
            // Day headings in "Latest" order, whenever the day changes from the previous item.
            const header = sort === "latest" && (idx === 0 || ukDay(shown[idx - 1].published) !== day) ? day : null;
            return (
              <li key={i.id} className="py-2.5">
                {header && <div className="-mt-1 mb-2 pt-1 text-xs font-semibold text-ink-2">{header}</div>}
                <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-ink hover:underline">
                  {i.title}
                </a>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className="text-ink-2">{i.source}</span>
                  <span>{sort === "latest" ? ukTime(i.published) : `${ukDay(i.published)}, ${ukTime(i.published)}`}</span>
                  {i.topics.map((t) => (
                    <span key={t} className="rounded bg-surface-2 px-1.5 py-px text-[11px] text-ink-2">
                      {label[t] ?? t}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
