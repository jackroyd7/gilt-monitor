"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { boldRuns, parseBriefing, type Briefing } from "@/lib/briefing";

function Rich({ text }: { text: string }) {
  return (
    <>
      {boldRuns(text).map((r, i) =>
        r.bold ? (
          <strong key={i} className="font-semibold text-ink">
            {r.text}
          </strong>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  );
}

const SEEN_KEY = "gilt-monitor:briefing-seen";
const LOCAL_KEY = "gilt-monitor:briefing";

const newer = (a: Briefing | undefined, b: Briefing | undefined) =>
  !a ? b : !b ? a : a.generatedAt >= b.generatedAt ? a : b;

/**
 * The AI morning briefing as a pop-up: it opens by itself the first time you visit on the
 * day it was written (remembered per browser), and the card reopens it. A briefing written
 * with the button is also kept in this browser, so it survives server restarts.
 */
export default function BriefingCard({
  briefing: fromServer,
  today,
  shared,
}: {
  briefing: Briefing | undefined;
  today: string;
  /** Whether briefings are kept in shared storage (visible on every device). */
  shared: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<Briefing | undefined>(undefined);
  const [writing, setWriting] = useState<{
    busy: boolean;
    started?: number;
    error?: string;
  }>({ busy: false });
  const [elapsed, setElapsed] = useState(0);
  const briefing = newer(fromServer, local);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(LOCAL_KEY) ?? "null",
      ) as Briefing | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of browser storage
      if (saved?.markdown && saved.generatedAt) setLocal(saved);
    } catch {}
  }, []);

  // Elapsed-time counter while writing.
  useEffect(() => {
    if (!writing.busy) return;
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [writing.busy]);

  const write = () => {
    setElapsed(0);
    setWriting({ busy: true });
    fetch("/api/briefing", { method: "POST" })
      .then(async (r) => {
        // The server sends spaces while it works, then JSON; a timeout returns a web page instead.
        const text = (await r.text()).trim();
        let d: (Briefing & { error?: string }) | null = null;
        try {
          d = JSON.parse(text);
        } catch {
          throw new Error(
            r.status === 504 || /timed? ?out/i.test(text)
              ? "The server timed out writing it. Please try again."
              : `Unexpected reply from the server (${r.status}).`,
          );
        }
        if (!d || d.error || !d.markdown)
          throw new Error(d?.error ?? `error ${r.status}`);
        try {
          localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
          localStorage.setItem(SEEN_KEY, d.date);
        } catch {}
        setLocal(d);
        setWriting({ busy: false });
        setOpen(true);
      })
      .catch((e: Error) =>
        setWriting({
          busy: false,
          error:
            e.message === "Failed to fetch"
              ? "Lost connection to the server. Please try again."
              : e.message,
        }),
      );
  };
  // Prominent when there's no briefing for today; otherwise a quiet secondary link.
  const hasToday = briefing?.date === today;
  const writeButton = (
    <div
      className={`flex flex-wrap items-center gap-2 text-sm ${hasToday ? "justify-end" : "mt-2"}`}
    >
      {writing.error && (
        <span style={{ color: "var(--critical)" }}>{writing.error}</span>
      )}
      <button
        onClick={write}
        disabled={writing.busy}
        className={
          hasToday && !writing.busy
            ? "text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
            : "rounded-md bg-[color:var(--accent)] px-3 py-1.5 font-medium text-white disabled:opacity-60"
        }
      >
        {writing.busy
          ? `Writing… ${elapsed}s (usually 1–2 minutes)`
          : briefing?.date === today
            ? "Write a fresh one"
            : "Write today's briefing now"}
      </button>
    </div>
  );
  const sharedNote = !shared && (
    <p className="mt-2 text-xs text-muted">
      Saved on this device only: connect Upstash Redis in Vercel → Storage to
      see briefings on all your devices.
    </p>
  );

  useEffect(() => {
    if (!fromServer || fromServer.date !== today) return;
    try {
      if (localStorage.getItem(SEEN_KEY) === fromServer.date) return;
      localStorage.setItem(SEEN_KEY, fromServer.date);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open once per day, after reading browser storage
    setOpen(true);
  }, [fromServer, today]);

  if (!briefing) {
    return (
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-ink">Morning briefing</h2>
        <p className="mt-1 text-sm text-muted">
          No briefing yet. One is written automatically on weekday mornings
          (about 06:35 UK time), or write one now.
        </p>
        {writeButton}
        {sharedNote}
      </section>
    );
  }
  const written = new Date(briefing.generatedAt);
  const when = written.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const blocks = parseBriefing(briefing.markdown);
  // Group bullets under their headings so each section can sit in its own column on wide screens.
  const sections: { title: string; items: typeof blocks }[] = [];
  for (const b of blocks) {
    if (b.type === "h" || !sections.length)
      sections.push({ title: b.type === "h" ? b.text : "", items: [] });
    if (b.type !== "h") sections[sections.length - 1].items.push(b);
  }
  const stamp = (
    <span className="text-xs text-muted" suppressHydrationWarning>
      Written {when} UK · AI-generated from our data, news and web search; check
      before acting
      {briefing.date !== today && (
        <strong className="ml-1 text-[color:var(--warning)]">
          · not today&apos;s
        </strong>
      )}
    </span>
  );
  const lead = sections[0]?.items.find((b) => b.type !== "h")?.text;
  return (
    <>
      <section className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Morning briefing</h2>
          {stamp}
        </div>
        {lead && (
          <p className="mt-1 line-clamp-2 text-sm text-ink-2">
            <Rich text={lead} />
          </p>
        )}
        {/* Read on the left, writing a new one well away on the right. */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-3">
          <button
            onClick={() => setOpen(true)}
            className="text-sm font-medium text-accent"
          >
            Read the briefing →
          </button>
          {writeButton}
        </div>
        {sharedNote}
      </section>
      {open && (
        <Modal
          title="Morning briefing"
          subtitle={`${when} UK · AI-generated; check before acting`}
          onClose={() => setOpen(false)}
        >
          <div className="text-[15px]">
            <div className="grid gap-x-8 gap-y-4">
              {sections.map((s, i) => (
                <div key={i}>
                  {s.title && (
                    <h3 className="mb-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">
                      {s.title}
                    </h3>
                  )}
                  <div className="space-y-1 text-sm leading-relaxed text-ink">
                    {s.items.map((b, j) =>
                      b.type === "li" ? (
                        <div key={j} className="flex gap-2">
                          <span aria-hidden className="text-muted">
                            •
                          </span>
                          <p>
                            <Rich text={b.text} />
                          </p>
                        </div>
                      ) : (
                        <p key={j}>
                          <Rich text={b.text} />
                        </p>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>
            {briefing.sources.length > 0 && (
              <details className="mt-3 text-xs text-muted">
                <summary className="cursor-pointer">
                  Sources ({briefing.sources.length})
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {briefing.sources.map((s) => (
                    <li key={s.url}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-accent"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
