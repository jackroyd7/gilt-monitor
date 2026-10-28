import { addDays, dateOnOrBefore, latestDate } from "./curve";
import { lastOnOrBefore, meetingPath, monthlyPath, type PolicyData } from "./policy";
import type { CurveSet } from "./types";

const ukDate = (iso: string) => {
  const d = new Date(iso + "T12:00:00Z");
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Everything the BoE path page and the Overview summary need, or null without data. */
export function policyView(fwd: CurveSet | undefined, policy: PolicyData | undefined) {
  const d = latestDate(fwd);
  if (!fwd || !d || !policy?.bankRate.length) return null;
  const bank = lastOnOrBefore(policy.bankRate, d) ?? policy.bankRate.at(-1)![1];
  const sonia = lastOnOrBefore(policy.sonia, d);
  const gap = sonia == null ? 0 : bank - sonia;
  const at = (days: number) => dateOnOrBefore(fwd, addDays(d, -days));
  const now = meetingPath(fwd, d, policy.mpcDates, bank, sonia);
  const ago = (days: number) => {
    const dd = at(days);
    if (!dd) return new Map<string, number>();
    const b = lastOnOrBefore(policy.bankRate, dd) ?? bank;
    return new Map(meetingPath(fwd, dd, policy.mpcDates, b, lastOnOrBefore(policy.sonia, dd)).map((m) => [m.date, m.rate]));
  };
  const w1 = ago(7);
  const m1 = ago(30);
  const toDates = (pts: [number, number][], from: string): [string, number][] => pts.map(([t, v]) => [addDays(from, Math.round(t * 365.25)), v]);
  const series = [
    { key: "now", name: `Today (${ukDate(d)})`, color: "var(--series-1)", points: toDates(monthlyPath(fwd, d, gap), d) },
    ...[["w1", "1 week ago", 7, "var(--series-2)"], ["m1", "1 month ago", 30, "var(--series-3)"]].flatMap(([key, name, days, color]) => {
      const dd = at(days as number);
      return dd ? [{ key: key as string, name: name as string, color: color as string, dashed: true, points: toDates(monthlyPath(fwd, dd, gap), dd) }] : [];
    }),
  ];
  const next = now[0];
  return {
    curveDate: d,
    bank,
    sonia,
    meetings: now.map((m) => ({ ...m, label: ukDate(m.date), w1: w1.has(m.date) ? (m.rate - w1.get(m.date)!) * 100 : null, m1: m1.has(m.date) ? (m.rate - m1.get(m.date)!) * 100 : null })),
    series,
    next: next ? { label: ukDate(next.date), change: next.change, odds: Math.min(100, Math.abs(next.change / 25) * 100) } : null,
    end: now.at(-1) ? { label: ukDate(now.at(-1)!.date), rate: now.at(-1)!.rate, cumulative: now.at(-1)!.cumulative } : null,
    knownDates: policy.mpcDates.filter((x) => x > d).length,
  };
}
