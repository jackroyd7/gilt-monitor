import { boldRuns, londonClock, parseBriefing, type Briefing } from "@/lib/briefing";

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

/** The AI morning briefing, rendered from its small markdown subset (no raw HTML). */
export default function BriefingCard({ briefing, now }: { briefing: Briefing | undefined; now: Date }) {
  if (!briefing) {
    return (
      <section className="card p-4">
        <h2 className="text-sm font-semibold text-ink">Morning briefing</h2>
        <p className="mt-1 text-sm text-muted">
          No briefing yet. It is written at about 06:40 UK time on weekdays by the “Morning briefing” GitHub Action (needs the{" "}
          <code>ANTHROPIC_API_KEY</code> repository secret).
        </p>
      </section>
    );
  }
  const today = londonClock(now).date;
  const written = new Date(briefing.generatedAt);
  const when = written.toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const blocks = parseBriefing(briefing.markdown);
  // Group bullets under their headings so each section can sit in its own column on wide screens.
  const sections: { title: string; items: typeof blocks }[] = [];
  for (const b of blocks) {
    if (b.type === "h" || !sections.length) sections.push({ title: b.type === "h" ? b.text : "", items: [] });
    if (b.type !== "h") sections[sections.length - 1].items.push(b);
  }
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">Morning briefing</h2>
        <span className="text-xs text-muted" suppressHydrationWarning>
          Written {when} UK · AI-generated from our data, news and web search; check before acting
          {briefing.date !== today && <strong className="ml-1 text-[color:var(--warning)]">· not today&apos;s</strong>}
        </span>
      </div>
      <div className="mt-3 grid gap-x-8 gap-y-4 lg:grid-cols-2">
        {sections.map((s, i) => (
          <div key={i} className={i === 0 ? "lg:col-span-2" : ""}>
            {s.title && <h3 className="mb-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">{s.title}</h3>}
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
          <summary className="cursor-pointer">Sources ({briefing.sources.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {briefing.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
