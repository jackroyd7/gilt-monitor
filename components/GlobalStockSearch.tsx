"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Hit = {
  symbol: string;
  name: string;
  ticker: string;
  market?: string;
  type?: string;
};

const pageUrl = (symbol: string) =>
  `/equities/stock?tvwidgetsymbol=${encodeURIComponent(symbol)}`;

/** Type-ahead over listings worldwide; picking one opens its stock page. */
export default function GlobalStockSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      fetch(`/api/search?q=${encodeURIComponent(query)}`, {
        signal: ctl.signal,
      })
        .then((r) => r.json())
        .then((d: { results?: Hit[] }) => {
          setHits(d.results ?? []);
          setActive(0);
          setBusy(false);
        })
        .catch(() => setBusy(false));
    }, 220);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (h: Hit | undefined) => {
    if (!h) return;
    setOpen(false);
    router.push(pageUrl(h.symbol));
  };
  const shown = q.trim() ? hits : [];

  return (
    <section className="card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Find a company</h2>
        <span className="text-xs text-muted">
          Any listed stock or ETF worldwide, by name or ticker
        </span>
      </div>
      <div ref={box} className="relative">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setBusy(!!e.target.value.trim());
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, shown.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(shown[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="e.g. Barclays, ASML, Nestlé, 7203.T, Shopify"
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
          aria-label="Search for a company"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls="global-stock-results"
        />
        {busy && (
          <span className="absolute top-2.5 right-3 text-xs text-muted">
            searching…
          </span>
        )}
        {open && shown.length > 0 && (
          <ul
            id="global-stock-results"
            role="listbox"
            className="card absolute z-30 mt-1 max-h-96 w-full overflow-auto p-1 shadow-lg"
          >
            {shown.map((h, i) => (
              <li key={h.symbol} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={`flex w-full items-baseline gap-3 rounded px-3 py-2 text-left text-sm ${i === active ? "bg-surface-2" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {h.name}
                  </span>
                  {h.type && (
                    <span className="rounded bg-surface-2 px-1 text-[10px] text-muted">
                      {h.type}
                    </span>
                  )}
                  <span className="hidden text-xs text-muted sm:inline">
                    {h.market}
                  </span>
                  <span className="num w-24 shrink-0 text-right text-xs text-ink-2">
                    {h.ticker}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {open && q.trim() && !busy && hits.length === 0 && (
          <div className="card absolute z-30 mt-1 w-full p-3 text-sm text-muted shadow-lg">
            No matches.
          </div>
        )}
      </div>
    </section>
  );
}
