"use client";

import { useTransition } from "react";
import { refreshLive } from "@/app/actions";

const ukTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
};

export interface LiveInfo {
  fetchedAt: string;
  priceTime?: string;
  count: number;
  failed: number;
  error?: string;
}

/** Shows how fresh the intraday prices are, with a button to pull them again now. */
export default function LiveBar({ live }: { live: LiveInfo | null }) {
  const [pending, start] = useTransition();
  if (!live) {
    return (
      <p className="mb-4 text-xs text-muted">
        Prices are the DMO close. Set <code>GILTSYIELD_API_KEY</code> for intraday prices from giltsyield.com.
      </p>
    );
  }
  const ok = live.count > 0;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line bg-surface px-3 py-2 text-xs text-ink-2">
      <span className="font-medium text-ink">
        <span style={{ color: ok ? "var(--good)" : "var(--critical)" }}>{ok ? "●" : "▲"}</span>{" "}
        {ok ? "Intraday prices · giltsyield.com" : "Intraday prices unavailable · showing DMO close"}
      </span>
      {live.priceTime && <span>prices as of {ukTime(live.priceTime)}</span>}
      <span>fetched {ukTime(live.fetchedAt)} UK</span>
      {ok && <span>{live.count} gilts{live.failed ? `, ${live.failed} failed` : ""}</span>}
      {live.error && <span title={live.error} style={{ color: "var(--critical)" }}>last refresh failed (hover)</span>}
      <button
        onClick={() => start(() => refreshLive())}
        disabled={pending}
        className="ml-auto rounded-md border border-line bg-surface-2 px-2.5 py-1 text-ink hover:bg-surface disabled:opacity-60"
      >
        {pending ? "Refreshing…" : "Refresh prices"}
      </button>
    </div>
  );
}

