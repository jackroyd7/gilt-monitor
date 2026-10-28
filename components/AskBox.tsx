"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

const EXAMPLES: [string, string][] = [
  ["/gilts/boe", "How many cuts are priced for next year, and what changed this month?"],
  ["/gilts", "Why has UK 2s10s flattened this month?"],
  ["/rates", "Why have US breakevens moved this month?"],
  ["/equities", "What's driving UK stocks today?"],
  ["/fx", "Why is sterling weaker against the euro this week?"],
  ["/commodities", "Why has Brent moved this week?"],
  ["/economy", "Is UK inflation falling faster than expected?"],
  ["/news", "What's the biggest market story today?"],
  ["/", "What matters most for gilts today?"],
];

/** "Ask about this page": a short AI answer using the dashboard's data (and a few web searches). */
export default function AskBox() {
  const page = usePathname();
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ busy?: boolean; text?: string; error?: string; sources?: { title: string; url: string }[]; asked?: string }>({});
  if (page === "/login") return null;
  const example = EXAMPLES.find(([p]) => (p === "/" ? page === "/" : page.startsWith(p)))?.[1] ?? "Ask about this page";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (question.length < 3 || state.busy) return;
    setState({ busy: true, asked: question });
    fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page, question }) })
      .then(async (r) => {
        const text = (await r.text()).trim();
        let d: { text?: string; error?: string; sources?: { title: string; url: string }[] };
        try {
          d = JSON.parse(text);
        } catch {
          throw new Error(r.status === 504 ? "Timed out; try again." : `Unexpected reply (${r.status}).`);
        }
        if (d.error || !d.text) throw new Error(d.error ?? "No answer.");
        setState({ text: d.text, sources: d.sources, asked: question });
      })
      .catch((err: Error) => setState({ error: err.message === "Failed to fetch" ? "Lost connection; try again." : err.message, asked: question }));
  };

  return (
    <div className="mb-4">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={300}
          placeholder={`Ask… e.g. ${example}`}
          aria-label="Ask a question about this page"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted"
        />
        <button disabled={state.busy || q.trim().length < 3} className="rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {state.busy ? "Thinking…" : "Ask"}
        </button>
      </form>
      {(state.text || state.error || state.busy) && (
        <div className="card mt-2 p-3 text-sm">
          <div className="mb-1 flex items-start justify-between gap-2">
            <span className="text-xs text-muted">{state.asked}</span>
            {!state.busy && (
              <button onClick={() => setState({})} aria-label="Close answer" className="px-1 text-ink-2 hover:text-ink">
                ✕
              </button>
            )}
          </div>
          {state.busy && <p className="text-muted">Looking at the data{" "}and recent news… (usually 10–30 seconds)</p>}
          {state.error && <p style={{ color: "var(--critical)" }}>{state.error}</p>}
          {state.text && (
            <>
              <p className="leading-relaxed whitespace-pre-line text-ink">{state.text}</p>
              <p className="mt-2 text-xs text-muted">
                AI-generated from this dashboard&apos;s data and web search; check before acting.
                {state.sources?.length ? (
                  <>
                    {" "}Sources:{" "}
                    {state.sources.map((s, i) => (
                      <span key={s.url}>
                        {i > 0 && ", "}
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                          {s.title}
                        </a>
                      </span>
                    ))}
                  </>
                ) : null}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
