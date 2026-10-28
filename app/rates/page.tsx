import Link from "next/link";
import { connection } from "next/server";
import HeadlineList from "@/components/HeadlineList";
import { SeriesChart } from "@/components/charts";
import { Card, PageHeader } from "@/components/Tiles";
import TradingViewWidget from "@/components/TradingViewWidget";
import { rateSA } from "@/lib/analytics";
import { addDays, latestDate, sortedDates } from "@/lib/curve";
import { loadMarket, loadPolicy, loadRates } from "@/lib/data";
import { getNews } from "@/lib/news-fetch";
import { policyView } from "@/lib/policy-view";
import { changeSince } from "@/lib/rv";
import type { CurveSet } from "@/lib/types";

export const metadata = { title: "Rates · Markets Monitor" };

type Point = [string, number];

// Government bond yields by maturity (TradingView's yield symbols).
const COUNTRIES = [
  ["US", "US"],
  ["GB", "UK"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["IT", "Italy"],
  ["ES", "Spain"],
  ["JP", "Japan"],
  ["CA", "Canada"],
  ["AU", "Australia"],
] as const;
const YIELD_GROUPS = (["02", "10", "30"] as const).map((m) => ({
  name: `${Number(m)}-year`,
  symbols: COUNTRIES.filter(([c]) => !(m === "30" && c === "ES")).map(([c, n]) => ({ name: `TVC:${c}${m}Y`, displayName: n })),
}));



/** A curve tenor as a daily series (semi-annual %), from a date. */
function tenorPoints(set: CurveSet | undefined, t: number, since: string): Point[] {
  if (!set) return [];
  return sortedDates(set)
    .filter((d) => d >= since)
    .flatMap((d) => {
      const v = rateSA(set, d, t);
      return v == null ? [] : [[d, +v.toFixed(4)] as Point];
    });
}

const pct = (v: number | null | undefined, d = 2) => (v == null ? "–" : `${v.toFixed(d)}%`);
const bp = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(0)}bp`);

export default async function RatesPage() {
  await connection();
  const [{ curves }, rates, policy, news] = await Promise.all([loadMarket(), loadRates(), loadPolicy(), getNews()]);
  const s = (id: keyof NonNullable<typeof rates>["series"]) => (rates?.series[id] ?? []) as Point[];
  const since = addDays(latestDate(curves.uk_nominal) ?? new Date().toISOString().slice(0, 10), -3 * 365);

  // Policy and overnight rates.
  const boe = policyView(curves.uk_ois_fwd, policy);
  const overnight = [
    { name: "Bank Rate", pts: (policy?.bankRate ?? []) as Point[], link: "/gilts/boe" },
    { name: "SONIA", pts: (policy?.sonia ?? []) as Point[] },
    { name: "Fed funds (upper)", pts: s("FED") },
    { name: "SOFR", pts: s("SOFR") },
    { name: "ECB deposit rate", pts: s("ECB") },
    { name: "€STR", pts: s("ESTR") },
  ];

  // Curve slopes for UK, US, Germany.
  const sets = [
    { name: "UK gilts", set: curves.uk_nominal },
    { name: "US Treasuries", set: curves.us_ust },
    { name: "German Bunds", set: curves.de_bund },
  ];
  const slope = (set: CurveSet | undefined, a: number, b: number): Point[] => {
    const x = tenorPoints(set, a, addDays(since, 2 * 365));
    const y = new Map(tenorPoints(set, b, addDays(since, 2 * 365)));
    return x.flatMap(([d, v]) => (y.has(d) ? [[d, y.get(d)! - v] as Point] : []));
  };
  const slopes = sets.map((c) => ({
    name: c.name,
    level10: tenorPoints(c.set, 10, addDays(since, 2 * 365)),
    s2s10: slope(c.set, 2, 10),
    s10s30: slope(c.set, 10, 30),
  }));
  const curveChart = sets.flatMap((c, i) => {
    const d = latestDate(c.set);
    if (!c.set || !d) return [];
    const pts = c.set.tenors
      .filter((t) => t >= 1 && t <= 30)
      .flatMap((t) => {
        const v = rateSA(c.set, d, t);
        return v == null ? [] : [[t, +v.toFixed(4)] as [number, number]];
      });
    return [{ key: `c${i}`, name: `${c.name} (${d})`, color: `var(--series-${i + 1})`, points: pts }];
  });

  // Inflation and real yields.
  const ukBei5 = tenorPoints(curves.uk_inflation, 5, since);
  const ukBei10 = tenorPoints(curves.uk_inflation, 10, since);
  const ukReal10 = tenorPoints(curves.uk_real, 10, since);
  const infl = [
    { name: "UK 5y RPI breakeven", pts: ukBei5, src: "BoE implied inflation (RPI)" },
    { name: "UK 10y RPI breakeven", pts: ukBei10, src: "BoE implied inflation (RPI)" },
    { name: "UK 10y real yield", pts: ukReal10, src: "BoE real zero curve" },
    { name: "US 5y breakeven", pts: s("US_BEI5"), src: "FRED T5YIE (CPI)" },
    { name: "US 10y breakeven", pts: s("US_BEI10"), src: "FRED T10YIE (CPI)" },
    { name: "US 5y5y inflation", pts: s("US_5Y5Y"), src: "FRED T5YIFR" },
    { name: "US 10y real yield", pts: s("US_REAL10"), src: "FRED DFII10 (TIPS)" },
  ];
  // Spreads and slopes in bp, daily from our curves.
  const diff = (a: Point[], b: Point[]): Point[] => {
    const m = new Map(b);
    return a.flatMap(([d, v]) => (m.has(d) ? [[d, +((v - m.get(d)!) * 100).toFixed(2)] as Point] : []));
  };
  const nearest = (a: Point[], b: Point[]): Point[] => {
    // Bund dates can differ by a day from gilt/Treasury dates: use the latest Bund on or before.
    const bs = [...b].sort();
    let j = 0;
    return a.flatMap(([d, v]) => {
      while (j + 1 < bs.length && bs[j + 1][0] <= d) j++;
      return bs[j] && bs[j][0] <= d ? [[d, +((v - bs[j][1]) * 100).toFixed(2)] as Point] : [];
    });
  };
  const since2 = addDays(since, 365);
  const de10 = tenorPoints(curves.de_bund, 10, since2);
  const spreadCharts = [
    { title: "UK − Germany 10y", note: "Gilt–Bund, daily", points: nearest(tenorPoints(curves.uk_nominal, 10, since2), de10) },
    { title: "US − Germany 10y", note: "Treasury–Bund, daily", points: nearest(tenorPoints(curves.us_ust, 10, since2), de10) },
    { title: "UK 2s10s", note: "Gilt curve slope, daily", points: slopes[0].s2s10.map(([d, v]) => [d, +(v * 100).toFixed(2)] as Point) },
    { title: "US 2s10s", note: "Treasury curve slope, daily", points: slopes[1].s2s10.map(([d, v]) => [d, +(v * 100).toFixed(2)] as Point) },
    { title: "US 5s30s", note: "Long-end term premium, daily", points: diff(tenorPoints(curves.us_ust, 30, since2), tenorPoints(curves.us_ust, 5, since2)) },
    { title: "Germany 2s10s", note: "Bund curve slope, daily", points: slopes[2].s2s10.map(([d, v]) => [d, +(v * 100).toFixed(2)] as Point) },
  ];

  const ratesNews = news.items.filter((i) => i.topics.some((t) => ["global", "gilts", "boe"].includes(t))).slice(0, 10);

  return (
    <>
      <PageHeader title="Rates">
        Policy and overnight rates, government bond yields across markets, curve slopes, sovereign spreads, and inflation
        expectations. Curves and breakevens are end-of-day (BoE, Bundesbank, US Treasury, FRED); the yield grid and spread
        charts are TradingView&apos;s.
      </PageHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {overnight.map((o) => {
            const last = o.pts.at(-1);
            const inner = (
              <>
                <div className="text-xs text-ink-2">{o.name}</div>
                <div className="mt-1 text-2xl font-semibold text-ink">{pct(last?.[1])}</div>
                <div className="text-xs text-ink-2">1m {bp(changeSince(o.pts, 31))} · {last?.[0] ?? "no data"}</div>
              </>
            );
            return o.link ? (
              <Link key={o.name} href={o.link} className="card p-3 hover:border-[color:var(--accent)]">
                {inner}
              </Link>
            ) : (
              <div key={o.name} className="card p-3">
                {inner}
              </div>
            );
          })}
        </div>
        {boe?.next && (
          <p className="text-sm text-ink-2">
            BoE: next MPC {boe.next.label},{" "}
            {Math.abs(boe.next.change) < 2 ? "no change priced" : `${boe.next.change > 0 ? "+" : "−"}${Math.abs(boe.next.change).toFixed(0)}bp priced`}
            {boe.end && <>; {boe.end.rate.toFixed(2)}% priced by {boe.end.label}</>}.{" "}
            <Link href="/gilts/boe" className="text-accent">
              Rate path →
            </Link>
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Government bond yields" subtitle="Live, by maturity. Click one for its chart." exportable={false}>
            <TradingViewWidget widget="market-quotes" height={440} chartPath="/charts" lazy config={{ width: "100%", height: 440, symbolsGroups: YIELD_GROUPS, showSymbolLogo: false }} />
          </Card>
          <Card title="Curves today" subtitle="Zero curves (US: par), semi-annual %. UK BoE, Germany Bundesbank, US Treasury.">
            <SeriesChart series={curveChart} xKind="tenor" unit="pct" height={300} />
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-normal">Market</th>
                  <th className="py-1 text-right font-normal">10y</th>
                  <th className="py-1 text-right font-normal">2s10s</th>
                  <th className="py-1 text-right font-normal">1m chg</th>
                  <th className="py-1 text-right font-normal">10s30s</th>
                  <th className="py-1 text-right font-normal">1m chg</th>
                </tr>
              </thead>
              <tbody className="num">
                {slopes.map((x) => (
                  <tr key={x.name} className="border-t border-line">
                    <td className="py-1.5 text-ink">{x.name}</td>
                    <td className="py-1.5 text-right text-ink">{pct(x.level10.at(-1)?.[1])}</td>
                    <td className="py-1.5 text-right text-ink">{x.s2s10.at(-1) ? `${(x.s2s10.at(-1)![1] * 100).toFixed(0)}bp` : "–"}</td>
                    <td className="py-1.5 text-right text-ink-2">{bp(changeSince(x.s2s10, 31))}</td>
                    <td className="py-1.5 text-right text-ink">{x.s10s30.at(-1) ? `${(x.s10s30.at(-1)![1] * 100).toFixed(0)}bp` : "–"}</td>
                    <td className="py-1.5 text-right text-ink-2">{bp(changeSince(x.s10s30, 31))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
        <section>
          <h2 className="mb-1 text-sm font-semibold text-ink">Spreads and slopes</h2>
          <p className="mb-2 text-xs text-muted">Daily, from the BoE, Bundesbank and US Treasury curves (bp).</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {spreadCharts.map((c) => (
              <Card key={c.title} title={c.title} subtitle={c.note}>
                <div className="num mb-1 text-xs text-ink-2">
                  Latest <span className="font-medium text-ink">{c.points.at(-1) ? `${c.points.at(-1)![1].toFixed(0)}bp` : "–"}</span>
                  {" · "}1m {bp(changeSince(c.points, 31) == null ? null : changeSince(c.points, 31)! / 100)}
                  {" · "}3m {bp(changeSince(c.points, 92) == null ? null : changeSince(c.points, 92)! / 100)}
                </div>
                <SeriesChart series={[{ key: "s", name: c.title, color: "var(--series-1)", points: c.points }]} xKind="date" unit="bp" height={180} showLegend={false} />
              </Card>
            ))}
          </div>
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Inflation expectations and real yields" subtitle="End of day. UK breakevens are RPI (BoE nominal minus real curve); US breakevens are CPI (Treasuries minus TIPS).">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-normal">Measure</th>
                  <th className="py-1 text-right font-normal">Level</th>
                  <th className="py-1 text-right font-normal">1w</th>
                  <th className="py-1 text-right font-normal">1m</th>
                  <th className="py-1 text-right font-normal">3m</th>
                </tr>
              </thead>
              <tbody className="num">
                {infl.map((r) => (
                  <tr key={r.name} className="border-t border-line" title={r.src}>
                    <td className="py-1.5 text-ink">{r.name}</td>
                    <td className="py-1.5 text-right text-ink">{pct(r.pts.at(-1)?.[1])}</td>
                    <td className="py-1.5 text-right text-ink-2">{bp(changeSince(r.pts, 7))}</td>
                    <td className="py-1.5 text-right text-ink-2">{bp(changeSince(r.pts, 31))}</td>
                    <td className="py-1.5 text-right text-ink-2">{bp(changeSince(r.pts, 92))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="10-year breakevens and real yields" subtitle="UK (RPI) vs US (CPI). RPI runs roughly 0.5–1pt above CPI, so UK breakevens sit higher.">
            <SeriesChart
              xKind="date"
              unit="pct"
              height={300}
              series={[
                { key: "ukb", name: "UK 10y breakeven", color: "var(--series-1)", points: ukBei10 },
                { key: "usb", name: "US 10y breakeven", color: "var(--series-2)", points: s("US_BEI10").filter(([d]) => d >= since) },
                { key: "ukr", name: "UK 10y real", color: "var(--series-1)", dashed: true, points: ukReal10 },
                { key: "usr", name: "US 10y real", color: "var(--series-2)", dashed: true, points: s("US_REAL10").filter(([d]) => d >= since) },
              ]}
            />
          </Card>
        </div>
        <Card title="Rates news" exportable={false}>
          <HeadlineList items={ratesNews} />
        </Card>
      </div>
    </>
  );
}
