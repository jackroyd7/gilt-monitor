import "server-only";
import { residualHistories, screens, yieldHistories, type Screen } from "./rv";
import type { GiltHistory } from "./types";

// The history-based screens fit a curve for every day (~0.5s), so results are cached per
// process until the history gains a new day.
type Cached = { key: string; residuals: Map<string, [string, number][]>; switches: Screen[]; flies: Screen[] };
const store = ((globalThis as { __giltRv?: { c: Cached | null } }).__giltRv ??= { c: null });

export function rvHistory(hist: GiltHistory | undefined, gilts: { isin: string; name: string; years: number }[]) {
  if (!hist) return { residuals: new Map<string, [string, number][]>(), switches: [] as Screen[], flies: [] as Screen[] };
  const dates = Object.keys(hist.rows).sort();
  const key = `${dates.length}:${dates[dates.length - 1]}:${gilts.length}`;
  if (store.c?.key !== key) {
    const ys = yieldHistories(hist);
    store.c = { key, residuals: residualHistories(hist), ...screens(gilts, ys) };
  }
  return store.c;
}
