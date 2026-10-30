"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Analysis, AnalysedStock } from "@/lib/tips-analyse";
import type { ResolvedTip } from "@/lib/tips-ai";
import {
  applyTrades,
  HORIZON,
  holdingValue,
  RISK,
  stopFor,
  suggestTrades,
  targetFor,
  targetWeights,
  type Book,
  type Horizon,
  type Risk,
  type Suggestion,
  type Tip,
  type Verdict,
} from "@/lib/tips";

// The tips portfolio: read a week's tips from screenshots, review them, build or adjust a
// portfolio with share counts, and track how tips and holdings do. Saved in this browser,
// and across devices when Upstash Redis is connected.

interface State {
  updatedAt: string;
  tips: Tip[];
  book: Book;
  analysis?: Analysis;
  /** Your own include / exclude choices over the AI's verdicts, by symbol. */
  overrides?: Record<string, Verdict>;
}

type Perf = {
  prices: Record<
    string,
    { price: number; currency?: string; perPound: number | null }
  >;
  tipReturns: Record<string, { since: number | null; ftse: number | null }>;
  ftseSince: number | null;
};

const LOCAL_KEY = "gilt-monitor:tips-portfolio:v1";
const emptyState = (): State => ({
  updatedAt: new Date(0).toISOString(),
  tips: [],
  book: {
    cash: 0,
    holdings: [],
    trades: [],
    settings: { risk: "balanced", horizon: "1y" },
  },
});

const today = () => new Date().toISOString().slice(0, 10);
const gbp = (v: number) => `£${Math.round(v).toLocaleString("en-GB")}`;
const price = (v: number | undefined, ccy?: string) =>
  v == null
    ? "–"
    : ccy === "GBp" || ccy === "GBX"
      ? `${v.toFixed(v >= 1000 ? 0 : 1)}p`
      : `${v.toFixed(2)}${ccy && ccy !== "GBP" ? ` ${ccy}` : ""}`;
const pctTxt = (v: number | null | undefined, dp = 1) =>
  v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(dp)}%`;
const Pct = ({ v, dp = 1 }: { v: number | null | undefined; dp?: number }) =>
  v == null ? (
    <span className="text-muted">–</span>
  ) : (
    <span style={{ color: v >= 0 ? "var(--down)" : "var(--up)" }}>
      {pctTxt(v, dp)}
    </span>
  );
const stockHref = (s: string) =>
  `/equities/stock?tvwidgetsymbol=${encodeURIComponent(s)}`;

/** Streams spaces while the server works, then JSON. */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = (await r.text()).trim();
  let d: T & { error?: string };
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error(
      r.status === 413
        ? "Those screenshots are too large; try fewer at once."
        : r.status === 504
          ? "The server timed out; please try again."
          : `Unexpected reply (${r.status}).`,
    );
  }
  if (d.error) throw new Error(d.error);
  return d;
}

/** Shrinks a screenshot to at most 1600px on its long side, as JPEG. */
async function shrink(
  file: File,
): Promise<{ data: string; mediaType: "image/jpeg"; preview: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { data: url.split(",")[1], mediaType: "image/jpeg", preview: url };
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5 text-xs">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`rounded px-2.5 py-1 ${value === v ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const VERDICT_STYLE: Record<Verdict, { label: string; color: string }> = {
  include: { label: "Include", color: "var(--down)" },
  maybe: { label: "Maybe", color: "var(--warning)" },
  skip: { label: "Skip", color: "var(--up)" },
};

export default function TipsPortfolio({ shared }: { shared: boolean }) {
  const [state, setState] = useState<State>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [perf, setPerf] = useState<Perf | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load: this browser's copy, then the shared copy if it's newer.
  useEffect(() => {
    let local: State | null = null;
    try {
      local = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null");
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of browser storage
    if (local?.book) setState(local);
    setLoaded(true);
    if (!shared) return;
    fetch("/api/tips/state")
      .then((r) => r.json())
      .then((d: { state?: State | null }) => {
        if (d.state?.book && (!local || d.state.updatedAt > local.updatedAt))
          setState(d.state);
      })
      .catch(() => {});
  }, [shared]);

  const update = useCallback(
    (f: (s: State) => State) => {
      setState((prev) => {
        const next = { ...f(prev), updatedAt: new Date().toISOString() };
        try {
          localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
        } catch {}
        if (shared) {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            fetch("/api/tips/state", {
              method: "PUT",
              body: JSON.stringify(next),
            }).catch(() => {});
          }, 800);
        }
        return next;
      });
    },
    [shared],
  );

  // Latest prices for holdings and tip returns.
  const perfKey = useMemo(
    () =>
      JSON.stringify([
        state.book.holdings.map((h) => h.symbol),
        state.tips.map((t) => `${t.id}:${t.symbol}`),
      ]),
    [state.book.holdings, state.tips],
  );
  useEffect(() => {
    if (!loaded || (!state.tips.length && !state.book.holdings.length)) return;
    const since = state.book.trades[0]?.date;
    postJson<Perf>("/api/tips/performance", {
      tips: state.tips,
      symbols: state.book.holdings.map((h) => h.symbol),
      since,
    })
      .then(setPerf)
      .catch(() => {});
    // perfKey covers what matters; the full state would refetch on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, perfKey]);

  const { book } = state;
  const started =
    book.holdings.length > 0 || book.trades.length > 0 || book.cash > 0;

  return (
    <div className="space-y-4">
      <SettingsCard
        state={state}
        update={update}
        started={started}
        perf={perf}
      />
      <UploadCard
        onSave={(tips) =>
          update((s) => {
            const seen = new Set(
              s.tips.map((t) => `${t.week}|${t.symbol ?? t.company}`),
            );
            return {
              ...s,
              tips: [
                ...s.tips,
                ...tips.filter(
                  (t) => !seen.has(`${t.week}|${t.symbol ?? t.company}`),
                ),
              ],
            };
          })
        }
      />
      <ReviewCard state={state} update={update} started={started} />
      <HoldingsCard state={state} update={update} perf={perf} />
      <TipLog state={state} update={update} perf={perf} />
      {!shared && (
        <p className="text-xs text-muted">
          Saved in this browser only: connect Upstash Redis in Vercel → Storage
          to keep the tips and portfolio on all your devices.
        </p>
      )}
      <p className="text-xs text-muted">
        AI-assisted analysis of published tips using delayed market data; not
        financial advice. Check prices and the companies&apos; own news before
        trading.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- settings

function SettingsCard({
  state,
  update,
  started,
  perf,
}: {
  state: State;
  update: (f: (s: State) => State) => void;
  started: boolean;
  perf: Perf | null;
}) {
  const { book } = state;
  const [amount, setAmount] = useState("");
  const value = book.holdings.reduce(
    (s, h) =>
      s +
      holdingValue(
        h,
        perf?.prices[h.symbol]?.price,
        perf?.prices[h.symbol]?.perPound ?? undefined,
      ),
    0,
  );
  const cost = book.holdings.reduce((s, h) => s + h.costGbp, 0);
  const setSettings = (patch: Partial<Book["settings"]>) =>
    update((s) => ({
      ...s,
      book: { ...s.book, settings: { ...s.book.settings, ...patch } },
    }));
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="mb-1 text-xs text-muted">Risk</div>
          <Seg<Risk>
            value={book.settings.risk}
            options={Object.entries(RISK).map(([k, v]) => [k as Risk, v.label])}
            onChange={(risk) => setSettings({ risk })}
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-muted">Horizon</div>
          <Seg<Horizon>
            value={book.settings.horizon}
            options={Object.entries(HORIZON).map(([k, v]) => [
              k as Horizon,
              v.label,
            ])}
            onChange={(horizon) => setSettings({ horizon })}
          />
        </div>
        {!started ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Number(amount.replace(/[£,\s]/g, ""));
              if (v > 0)
                update((s) => ({ ...s, book: { ...s.book, cash: v } }));
            }}
          >
            <label className="text-xs text-muted">
              Amount to invest (£)
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 50,000"
                className="mt-1 block w-36 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <button className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-sm font-medium text-white">
              Set
            </button>
          </form>
        ) : (
          <div className="num flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <div className="text-xs text-muted">Portfolio</div>
              <span className="font-semibold text-ink">
                {gbp(value + book.cash)}
              </span>
            </div>
            <div>
              <div className="text-xs text-muted">Invested</div>
              {gbp(value)} <Pct v={cost ? (value / cost - 1) * 100 : null} />
            </div>
            <div>
              <div className="text-xs text-muted">Cash</div>
              {gbp(book.cash)}
            </div>
            <div>
              <div className="text-xs text-muted">FTSE 100 since start</div>
              <Pct v={perf?.ftseSince} />
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        {RISK[book.settings.risk].note} Targets are capped at +
        {(HORIZON[book.settings.horizon].maxUpside * 100).toFixed(0)}% over{" "}
        {HORIZON[book.settings.horizon].label.toLowerCase()}; stops widen with
        each share&apos;s volatility.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- upload and check tips

type Draft = ResolvedTip & { keep: boolean; key: string };

function UploadCard({ onSave }: { onSave: (tips: Tip[]) => void }) {
  const [images, setImages] = useState<
    { data: string; mediaType: "image/jpeg"; preview: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string>();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [week, setWeek] = useState(today());

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const read = async () => {
    setBusy(true);
    setElapsed(0);
    setError(undefined);
    try {
      const d = await postJson<{
        issueDate: string | null;
        tips: ResolvedTip[];
      }>("/api/tips/extract", {
        images: images.map(({ data, mediaType }) => ({ data, mediaType })),
      });
      if (d.issueDate) setWeek(d.issueDate);
      setDrafts(
        d.tips.map((t, i) => ({ ...t, keep: true, key: `${i}-${t.company}` })),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!drafts) return;
    onSave(
      drafts
        .filter((d) => d.keep)
        .map((d) => ({
          id: `${week}-${Math.random().toString(36).slice(2, 8)}`,
          week,
          company: d.matchName ?? d.company,
          symbol: d.symbol ?? undefined,
          call: d.call,
          source: d.source ?? undefined,
          priceAtTip: d.priceAtTip ?? undefined,
          currency: d.currency ?? undefined,
          target: d.target ?? undefined,
          rationale: d.rationale,
        })),
    );
    setDrafts(null);
    setImages([]);
  };

  return (
    <section className="card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">
          1. Add this week&apos;s tips
        </h2>
        <span className="text-xs text-muted">
          Screenshots of the tips page; they&apos;re read, not stored
        </span>
      </div>
      {!drafts && (
        <>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line px-4 py-6 text-sm text-ink-2 hover:border-[color:var(--accent)]">
            <span>Choose or drop screenshots</span>
            <span className="text-xs text-muted">Up to 8 images</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={async (e) => {
                const files = [...(e.target.files ?? [])].slice(0, 8);
                e.target.value = "";
                try {
                  const shrunk = await Promise.all(files.map(shrink));
                  setImages((prev) => [...prev, ...shrunk].slice(0, 8));
                } catch {
                  setError("Couldn't open one of those images.");
                }
              }}
            />
          </label>
          {images.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                  <img
                    src={img.preview}
                    alt={`Screenshot ${i + 1}`}
                    className="h-20 w-auto rounded border border-line"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setImages((p) => p.filter((_, k) => k !== i))
                    }
                    className="absolute -top-2 -right-2 rounded-full bg-surface px-1.5 text-xs text-muted shadow"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={read}
                disabled={busy}
                className="ml-auto rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy
                  ? `Reading… ${elapsed}s`
                  : `Read ${images.length > 1 ? `${images.length} screenshots` : "screenshot"}`}
              </button>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="mt-2 text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
      {drafts && (
        <div className="mt-1 space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="text-xs text-muted">
              Issue date{" "}
              <input
                type="date"
                value={week}
                onChange={(e) => setWeek(e.target.value)}
                className="rounded border border-line bg-surface px-1.5 py-0.5 text-ink"
              />
            </label>
            <span className="text-xs text-muted">
              Check each match; untick anything you don&apos;t want logged.
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted">
                  <th className="py-1 pr-2 font-normal">Log</th>
                  <th className="py-1 pr-2 font-normal">Tip</th>
                  <th className="py-1 pr-2 font-normal">Listing</th>
                  <th className="py-1 pr-2 font-normal">Call</th>
                  <th className="py-1 pr-2 font-normal">Price / target</th>
                  <th className="py-1 font-normal">Source and case</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d, i) => (
                  <tr key={d.key} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        checked={d.keep}
                        onChange={(e) =>
                          setDrafts((p) =>
                            p!.map((x, k) =>
                              k === i ? { ...x, keep: e.target.checked } : x,
                            ),
                          )
                        }
                        aria-label={`Log ${d.company}`}
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-ink">{d.company}</td>
                    <td className="py-1.5 pr-2">
                      <ListingPicker
                        draft={d}
                        onPick={(symbol, name) =>
                          setDrafts((p) =>
                            p!.map((x, k) =>
                              k === i ? { ...x, symbol, matchName: name } : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={d.call}
                        onChange={(e) =>
                          setDrafts((p) =>
                            p!.map((x, k) =>
                              k === i
                                ? { ...x, call: e.target.value as Tip["call"] }
                                : x,
                            ),
                          )
                        }
                        className="rounded border border-line bg-surface px-1 py-0.5 text-ink"
                      >
                        <option value="buy">Buy</option>
                        <option value="hold">Hold</option>
                        <option value="sell">Sell</option>
                      </select>
                    </td>
                    <td className="num py-1.5 pr-2 text-ink-2">
                      {price(
                        d.priceAtTip ?? undefined,
                        d.currency ?? undefined,
                      )}
                      {d.target != null && (
                        <span className="text-muted">
                          {" "}
                          → {price(d.target, d.currency ?? undefined)}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-xs text-ink-2">
                      <span className="text-ink">{d.source ?? "–"}</span>{" "}
                      {d.rationale}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDrafts(null)}
              className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-sm font-medium text-white"
            >
              Save {drafts.filter((d) => d.keep).length} tips
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Pick the listing for a tip: the matches found, or search for another. */
function ListingPicker({
  draft,
  onPick,
}: {
  draft: Draft;
  onPick: (symbol: string | null, name: string | null) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<
    { symbol: string; name: string; ticker: string; market?: string }[]
  >([]);
  useEffect(() => {
    if (!searching || q.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, {
        signal: ctl.signal,
      })
        .then((r) => r.json())
        .then((d) => setHits(d.results ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, searching]);
  if (searching) {
    return (
      <div className="w-56">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or ticker"
          className="w-full rounded border border-line bg-surface px-1.5 py-0.5 text-sm text-ink"
        />
        <ul className="mt-1 max-h-40 overflow-auto text-xs">
          {hits.map((h) => (
            <li key={h.symbol}>
              <button
                type="button"
                onClick={() => {
                  onPick(h.symbol, h.name);
                  setSearching(false);
                }}
                className="w-full rounded px-1 py-0.5 text-left hover:bg-surface-2"
              >
                {h.name}{" "}
                <span className="text-muted">
                  {h.ticker} · {h.market}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const opts =
    draft.alternatives.some((a) => a.symbol === draft.symbol) || !draft.symbol
      ? draft.alternatives
      : [
          {
            symbol: draft.symbol,
            name: draft.matchName ?? draft.symbol,
            ticker: draft.symbol,
            market: "",
          },
          ...draft.alternatives,
        ];
  return (
    <select
      value={draft.symbol ?? ""}
      onChange={(e) => {
        if (e.target.value === "__search") return setSearching(true);
        const hit = opts.find((o) => o.symbol === e.target.value);
        onPick(e.target.value || null, hit?.name ?? null);
      }}
      className="max-w-56 rounded border border-line bg-surface px-1 py-0.5 text-ink"
      style={!draft.symbol ? { borderColor: "var(--warning)" } : undefined}
    >
      <option value="">
        {draft.symbol ? "No listing" : "Not found: choose…"}
      </option>
      {opts.map((o) => (
        <option key={o.symbol} value={o.symbol}>
          {o.name} ({o.ticker}
          {o.market ? `, ${o.market}` : ""})
        </option>
      ))}
      <option value="__search">Search for another…</option>
    </select>
  );
}

// ---------------------------------------------------------------- review and trades

function ReviewCard({
  state,
  update,
  started,
}: {
  state: State;
  update: (f: (s: State) => State) => void;
  started: boolean;
}) {
  const weeks = [...new Set(state.tips.map((t) => t.week))].sort().reverse();
  const [week, setWeek] = useState<string>("");
  const chosenWeek = week || weeks[0] || "";
  const [newMoney, setNewMoney] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string>();
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const a = state.analysis;
  const overrides = useMemo(() => state.overrides ?? {}, [state.overrides]);
  const { book } = state;

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const money = Math.max(0, Number(newMoney.replace(/[£,\s]/g, "")) || 0);
  const analyse = async () => {
    setBusy(true);
    setElapsed(0);
    setError(undefined);
    try {
      const tips = state.tips.filter((t) => t.week === chosenWeek);
      const res = await postJson<Analysis>("/api/tips/analyse", {
        tips,
        book,
        newMoney: money,
      });
      setSkipped(new Set());
      update((s) => ({ ...s, analysis: res, overrides: {} }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Re-run the arithmetic in the browser when you change risk, horizon or a verdict.
  const plan = useMemo(() => {
    if (!a) return null;
    const stocks: AnalysedStock[] = a.stocks.map((st) => ({
      ...st,
      verdict: overrides[st.symbol] ?? st.verdict,
      target: targetFor(
        st.price,
        st.review?.target ?? undefined,
        book.settings.horizon,
      ),
    }));
    const weights = targetWeights(stocks, book.settings, a.corr);
    const trades = suggestTrades(book, stocks, weights, today(), money);
    return { stocks, weights, trades };
  }, [a, overrides, book, money]);

  const accept = () => {
    if (!plan) return;
    const chosen = plan.trades.filter((_, i) => !skipped.has(i));
    update((s) => ({
      ...s,
      book: applyTrades(s.book, chosen, plan.stocks, today(), money),
      analysis: undefined,
      overrides: {},
    }));
    setNewMoney("");
  };

  const sectors = useMemo(() => {
    if (!plan) return [];
    const m = new Map<string, number>();
    for (const st of plan.stocks)
      if (plan.weights[st.symbol])
        m.set(
          st.sector ?? "Other",
          (m.get(st.sector ?? "Other") ?? 0) + plan.weights[st.symbol],
        );
    return [...m].sort((x, y) => y[1] - x[1]);
  }, [plan]);

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-sm font-semibold text-ink">
          2. Review and build
        </h2>
        {weeks.length > 0 && (
          <label className="text-xs text-muted">
            Tips from{" "}
            <select
              value={chosenWeek}
              onChange={(e) => setWeek(e.target.value)}
              className="rounded border border-line bg-surface px-1.5 py-0.5 text-sm text-ink"
            >
              {weeks.map((w) => (
                <option key={w} value={w}>
                  {w.split("-").reverse().join("/")} (
                  {state.tips.filter((t) => t.week === w).length})
                </option>
              ))}
            </select>
          </label>
        )}
        {started && (
          <label className="text-xs text-muted">
            New money (£){" "}
            <input
              value={newMoney}
              onChange={(e) => setNewMoney(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="w-24 rounded border border-line bg-surface px-1.5 py-0.5 text-sm text-ink"
            />
          </label>
        )}
        <button
          type="button"
          onClick={analyse}
          disabled={busy || !chosenWeek || (!started && !money)}
          className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy
            ? `Reviewing… ${elapsed}s (about a minute)`
            : a
              ? "Review again"
              : "Review tips"}
        </button>
      </div>
      {!weeks.length && (
        <p className="text-sm text-muted">
          Add a week&apos;s tips above first.
        </p>
      )}
      {weeks.length > 0 && !started && (
        <p className="text-sm text-muted">
          Set the amount to invest at the top, then review the tips.
        </p>
      )}
      {error && (
        <p className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}

      {a && plan && (
        <div className="space-y-4">
          <p className="text-sm text-ink">{a.overview}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-muted">
                  <th className="py-1 pr-2 font-normal">Verdict</th>
                  <th className="py-1 pr-2 font-normal">Stock</th>
                  <th className="num py-1 pr-2 text-right font-normal">
                    Price
                  </th>
                  <th className="num py-1 pr-2 text-right font-normal">
                    Since tip
                  </th>
                  <th className="num py-1 pr-2 text-right font-normal">
                    Target
                  </th>
                  <th className="num py-1 pr-2 text-right font-normal">Stop</th>
                  <th className="num py-1 pr-2 text-right font-normal">
                    Weight
                  </th>
                  <th className="py-1 font-normal">Why</th>
                </tr>
              </thead>
              <tbody>
                {plan.stocks.map((st) => {
                  const v = VERDICT_STYLE[st.verdict];
                  const w = plan.weights[st.symbol];
                  return (
                    <tr
                      key={st.symbol}
                      className="border-t border-line align-top"
                    >
                      <td className="py-1.5 pr-2">
                        <select
                          value={st.verdict}
                          onChange={(e) =>
                            update((s) => ({
                              ...s,
                              overrides: {
                                ...(s.overrides ?? {}),
                                [st.symbol]: e.target.value as Verdict,
                              },
                            }))
                          }
                          className="rounded border border-line bg-surface px-1 py-0.5 text-xs font-medium"
                          style={{ color: v.color }}
                          aria-label={`Verdict for ${st.name}`}
                        >
                          <option value="include">Include</option>
                          <option value="maybe">Maybe</option>
                          <option value="skip">Skip</option>
                        </select>
                        <div
                          className="mt-0.5 text-[11px] tracking-widest text-muted"
                          title={`Conviction ${st.conviction}/5`}
                        >
                          {"●".repeat(st.conviction)}
                          {"○".repeat(5 - st.conviction)}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2">
                        <Link
                          href={stockHref(st.symbol)}
                          className="text-ink hover:text-accent"
                        >
                          {st.name}
                        </Link>
                        <div className="text-[11px] text-muted">
                          {[
                            st.symbol.split(":")[1],
                            st.sector,
                            st.country,
                            st.held ? "held" : undefined,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          {st.vol != null && ` · vol ${st.vol.toFixed(0)}%`}
                        </div>
                      </td>
                      <td className="num py-1.5 pr-2 text-right">
                        {price(st.price, st.currency)}
                      </td>
                      <td className="num py-1.5 pr-2 text-right">
                        <Pct v={st.sinceTip} />
                      </td>
                      <td
                        className="num py-1.5 pr-2 text-right"
                        title={st.review?.targetBasis}
                      >
                        {st.target ? (
                          <>
                            {price(st.target, st.currency)}
                            <div className="text-[11px]">
                              <Pct
                                v={(st.target / st.price - 1) * 100}
                                dp={0}
                              />
                            </div>
                          </>
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className="num py-1.5 pr-2 text-right text-ink-2">
                        {price(
                          stopFor(st.price, st.vol, book.settings),
                          st.currency,
                        )}
                      </td>
                      <td className="num py-1.5 pr-2 text-right">
                        {w ? `${(w * 100).toFixed(1)}%` : "–"}
                      </td>
                      <td className="py-1.5 text-xs text-ink-2">
                        {st.review?.summary}
                        {st.review?.risks && (
                          <div className="text-muted">
                            Risk: {st.review.risks}
                          </div>
                        )}
                        {st.review?.targetBasis && (
                          <div className="text-muted">
                            Target: {st.review.targetBasis}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sectors.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">
                Target mix by sector
              </h3>
              <div className="flex h-3 overflow-hidden rounded-full bg-surface-2">
                {sectors.map(([sec, w], i) => (
                  <div
                    key={sec}
                    title={`${sec} ${(w * 100).toFixed(0)}%`}
                    style={{
                      width: `${w * 100}%`,
                      background: `var(--series-${(i % 5) + 1})`,
                    }}
                  />
                ))}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink-2">
                {sectors.map(([sec, w], i) => (
                  <span key={sec}>
                    <span
                      className="mr-1 inline-block h-2 w-2 rounded-full"
                      style={{ background: `var(--series-${(i % 5) + 1})` }}
                    />
                    {sec} {(w * 100).toFixed(0)}%
                  </span>
                ))}
                <span className="text-muted">
                  Cash{" "}
                  {(
                    (1 -
                      Object.values(plan.weights).reduce((x, y) => x + y, 0)) *
                    100
                  ).toFixed(0)}
                  %
                </span>
              </div>
              {Object.values(plan.weights).reduce((x, y) => x + y, 0) < 0.6 && (
                <p className="mt-1 text-xs text-muted">
                  Each stock is capped at{" "}
                  {(RISK[book.settings.risk].maxPosition * 100).toFixed(0)}% of
                  the portfolio, so the rest stays in cash until later weeks
                  bring more good ideas.
                </p>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-ink-2 uppercase">
              Proposed trades
            </h3>
            {plan.trades.length ? (
              <>
                <table className="num w-full text-sm">
                  <tbody>
                    {plan.trades.map((t: Suggestion, i) => (
                      <tr
                        key={`${t.side}-${t.symbol}`}
                        className={`border-t border-line ${skipped.has(i) ? "opacity-40" : ""}`}
                      >
                        <td className="py-1 pr-2">
                          <input
                            type="checkbox"
                            checked={!skipped.has(i)}
                            onChange={() =>
                              setSkipped((p) => {
                                const n = new Set(p);
                                if (n.has(i)) n.delete(i);
                                else n.add(i);
                                return n;
                              })
                            }
                            aria-label={`Include trade in ${t.name}`}
                          />
                        </td>
                        <td
                          className="py-1 pr-2 font-semibold"
                          style={{
                            color:
                              t.side === "buy" ? "var(--down)" : "var(--up)",
                          }}
                        >
                          {t.side === "buy" ? "Buy" : "Sell"}
                        </td>
                        <td className="py-1 pr-2 text-right">
                          {t.shares.toLocaleString("en-GB")}
                        </td>
                        <td className="py-1 pr-2 text-ink">{t.name}</td>
                        <td className="py-1 pr-2 text-right text-ink-2">
                          at {price(t.price, t.currency)}
                        </td>
                        <td className="py-1 pr-2 text-right">{gbp(t.gbp)}</td>
                        <td className="py-1 text-xs text-ink-2">{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-3 text-sm">
                  <span className="text-xs text-muted">
                    Recorded at these prices; adjust the holdings afterwards if
                    you trade at different ones.
                  </span>
                  <button
                    type="button"
                    onClick={accept}
                    className="rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-sm font-medium text-white"
                  >
                    Record {plan.trades.length - skipped.size} trades
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">No trades needed this week.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- holdings

function HoldingsCard({
  state,
  update,
  perf,
}: {
  state: State;
  update: (f: (s: State) => State) => void;
  perf: Perf | null;
}) {
  const { book } = state;
  if (!book.holdings.length && !book.trades.length) return null;
  const rows = book.holdings.map((h) => {
    const p = perf?.prices[h.symbol];
    const value = holdingValue(h, p?.price, p?.perPound ?? undefined);
    return { h, p, value, pnl: (value / h.costGbp - 1) * 100 };
  });
  const total = book.cash + rows.reduce((s, r) => s + r.value, 0);
  const sellAll = (symbol: string) => {
    const r = rows.find((x) => x.h.symbol === symbol);
    if (!r?.p) return;
    const t: Suggestion = {
      symbol,
      name: r.h.name,
      side: "sell",
      shares: r.h.shares,
      price: r.p.price,
      currency: r.p.currency,
      gbp: r.value,
      reason: "Sold by hand.",
    };
    update((s) => ({ ...s, book: applyTrades(s.book, [t], [], today()) }));
  };
  return (
    <section className="card p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink">3. Portfolio</h2>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="num w-full text-sm">
            <thead>
              <tr className="text-[11px] text-muted">
                <th className="py-1 pr-2 text-left font-normal">Holding</th>
                <th className="py-1 pr-2 text-right font-normal">Shares</th>
                <th className="py-1 pr-2 text-right font-normal">Cost</th>
                <th className="py-1 pr-2 text-right font-normal">Price</th>
                <th className="py-1 pr-2 text-right font-normal">Value</th>
                <th className="py-1 pr-2 text-right font-normal">Gain</th>
                <th className="py-1 pr-2 text-right font-normal">Weight</th>
                <th className="py-1 pr-2 text-right font-normal">Target</th>
                <th className="py-1 pr-2 text-right font-normal">Stop</th>
                <th className="py-1 pr-2 text-right font-normal">Review by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ h, p, value, pnl }) => {
                const alert =
                  p && h.stop != null && p.price <= h.stop
                    ? "Below stop"
                    : p && h.target != null && p.price >= h.target
                      ? "Target reached"
                      : h.reviewBy && today() >= h.reviewBy
                        ? "Due for review"
                        : null;
                return (
                  <tr key={h.symbol} className="border-t border-line">
                    <td className="py-1.5 pr-2 text-left">
                      <Link
                        href={stockHref(h.symbol)}
                        className="text-ink hover:text-accent"
                      >
                        {h.name}
                      </Link>
                      {alert && (
                        <span
                          className="ml-2 rounded px-1 text-[11px]"
                          style={{
                            color: "var(--warning)",
                            border: "1px solid var(--warning)",
                          }}
                        >
                          {alert}
                        </span>
                      )}
                      <div className="text-[11px] text-muted">
                        {[h.symbol.split(":")[1], h.sector]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {h.shares.toLocaleString("en-GB")}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-ink-2">
                      {price(h.cost, h.currency)}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {price(p?.price, h.currency)}
                    </td>
                    <td className="py-1.5 pr-2 text-right">{gbp(value)}</td>
                    <td className="py-1.5 pr-2 text-right">
                      <Pct v={p ? pnl : null} />
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {((value / total) * 100).toFixed(1)}%
                    </td>
                    <td className="py-1.5 pr-2 text-right text-ink-2">
                      {price(h.target, h.currency)}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-ink-2">
                      {price(h.stop, h.currency)}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-ink-2">
                      {h.reviewBy?.split("-").reverse().join("/")}
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        disabled={!p}
                        onClick={() =>
                          confirm(
                            `Record selling all ${h.name} at ${price(p?.price, h.currency)}?`,
                          ) && sellAll(h.symbol)
                        }
                        className="text-xs text-muted hover:text-ink disabled:opacity-40"
                      >
                        Sell
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">No holdings.</p>
      )}
      {book.trades.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-accent">
            Trade history ({book.trades.length})
          </summary>
          <table className="num mt-1 w-full text-xs">
            <tbody>
              {[...book.trades].reverse().map((t, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1 pr-2 text-ink-2">
                    {t.date.split("-").reverse().join("/")}
                  </td>
                  <td
                    className="py-1 pr-2"
                    style={{
                      color: t.side === "buy" ? "var(--down)" : "var(--up)",
                    }}
                  >
                    {t.side}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    {t.shares.toLocaleString("en-GB")}
                  </td>
                  <td className="py-1 pr-2 text-ink">{t.name}</td>
                  <td className="py-1 pr-2 text-right">
                    {price(t.price, t.currency)}
                  </td>
                  <td className="py-1 pr-2 text-right">{gbp(t.gbp)}</td>
                  <td className="py-1 text-ink-2">{t.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Reset</summary>
        <button
          type="button"
          onClick={() =>
            confirm(
              "Delete the portfolio and trade history? Your tips log is kept.",
            ) &&
            update((s) => ({
              ...s,
              book: { ...s.book, cash: 0, holdings: [], trades: [] },
              analysis: undefined,
            }))
          }
          className="mt-1 text-[color:var(--critical)]"
        >
          Delete the portfolio and start again
        </button>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------- tip log

function TipLog({
  state,
  update,
  perf,
}: {
  state: State;
  update: (f: (s: State) => State) => void;
  perf: Perf | null;
}) {
  const [open, setOpen] = useState(false);
  if (!state.tips.length) return null;
  const rows = [...state.tips].sort((a, b) => b.week.localeCompare(a.week));
  // Each publication's record: buy tips' moves against the FTSE 100 over the same time.
  const bySource = new Map<
    string,
    { n: number; excess: number; beat: number }
  >();
  for (const t of state.tips) {
    const r = perf?.tipReturns[t.id];
    if (t.call === "sell" || r?.since == null || r.ftse == null) continue;
    const k = t.source ?? "Unknown";
    const e = bySource.get(k) ?? { n: 0, excess: 0, beat: 0 };
    e.n++;
    e.excess += r.since - r.ftse;
    if (r.since > r.ftse) e.beat++;
    bySource.set(k, e);
  }
  const held = new Set(state.book.holdings.map((h) => h.symbol));
  return (
    <section className="card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">Tips log</h2>
        <span className="text-xs text-muted">
          {state.tips.length} tips; returns in local currency, against the FTSE
          100 over the same period
        </span>
      </div>
      {bySource.size > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {[...bySource]
            .sort((a, b) => b[1].n - a[1].n)
            .map(([src, e]) => (
              <div
                key={src}
                className="rounded-md border border-line px-2.5 py-1 text-xs"
              >
                <div className="text-ink">{src}</div>
                <div className="num text-ink-2">
                  {e.n} tips · beat FTSE {Math.round((e.beat / e.n) * 100)}% ·
                  avg <Pct v={e.excess / e.n} />
                </div>
              </div>
            ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="num w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted">
              <th className="py-1 pr-2 text-left font-normal">Week</th>
              <th className="py-1 pr-2 text-left font-normal">Company</th>
              <th className="py-1 pr-2 text-left font-normal">Call</th>
              <th className="py-1 pr-2 text-left font-normal">Source</th>
              <th className="py-1 pr-2 text-right font-normal">Since tip</th>
              <th className="py-1 pr-2 text-right font-normal">FTSE 100</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(open ? rows : rows.slice(0, 15)).map((t) => {
              const r = perf?.tipReturns[t.id];
              return (
                <tr key={t.id} className="border-t border-line">
                  <td className="py-1 pr-2 text-ink-2">
                    {t.week.split("-").reverse().join("/")}
                  </td>
                  <td className="py-1 pr-2 text-left">
                    {t.symbol ? (
                      <Link
                        href={stockHref(t.symbol)}
                        className="text-ink hover:text-accent"
                      >
                        {t.company}
                      </Link>
                    ) : (
                      <span className="text-ink-2">{t.company}</span>
                    )}
                    {t.symbol && held.has(t.symbol) && (
                      <span className="ml-1.5 text-[11px] text-accent">
                        held
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-left capitalize">{t.call}</td>
                  <td className="py-1 pr-2 text-left text-ink-2">
                    {t.source ?? "–"}
                  </td>
                  <td className="py-1 pr-2 text-right">
                    <Pct v={r?.since} />
                  </td>
                  <td className="py-1 pr-2 text-right text-ink-2">
                    {pctTxt(r?.ftse)}
                  </td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        update((s) => ({
                          ...s,
                          tips: s.tips.filter((x) => x.id !== t.id),
                        }))
                      }
                      className="text-xs text-muted hover:text-ink"
                      aria-label={`Remove ${t.company}`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 15 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-2 text-xs text-accent"
        >
          {open ? "Show fewer" : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}
