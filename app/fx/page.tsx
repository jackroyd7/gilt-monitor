import { connection } from "next/server";
import { FxTiles, Positioning, RatesVsFx, type CotSeries, type FxTile, type RatesFxPair } from "@/components/FxPanels";
import HeadlineList from "@/components/HeadlineList";
import MarketsBoard, { TickerTape } from "@/components/MarketsBoard";
import { Card, PageHeader } from "@/components/Tiles";
import TradingViewWidget from "@/components/TradingViewWidget";
import { SeriesChart } from "@/components/charts";
import { rateSA } from "@/lib/analytics";
import { addDays, dateOnOrBefore, latestDate, sortedDates } from "@/lib/curve";
import { loadFx, loadMarket } from "@/lib/data";
import { COT_CONTRACTS, FX_SERIES, cotNet, fxSeries, pctChange, realisedVol, rollingCorrelation, rollingVol, type Point } from "@/lib/fx";
import { getNews } from "@/lib/news-fetch";
import type { CurveSet } from "@/lib/types";

export const metadata = { title: "FX · Markets Monitor" };

const TV_SYMBOL: Partial<Record<string, string>> = { GBPUSD: "FX:GBPUSD", GBPEUR: "FX_IDC:GBPEUR", GBPJPY: "FX:GBPJPY", GBPCHF: "FX:GBPCHF" };
const CURRENCIES = ["GBP", "USD", "EUR", "JPY", "CHF", "AUD", "CAD"];

/** UK 2y minus another market's 2y, in bp, on each UK curve date (semi-annual basis). */
function spreadSeries(uk: CurveSet | undefined, other: CurveSet | undefined, since: string, t = 2): Point[] {
  if (!uk || !other) return [];
  return sortedDates(uk)
    .filter((d) => d >= since)
    .flatMap((d) => {
      const a = rateSA(uk, d, t);
      const b = rateSA(other, dateOnOrBefore(other, d), t);
      return a == null || b == null ? [] : [[d, (a - b) * 100] as Point];
    });
}

const gap = (uk: CurveSet | undefined, other: CurveSet | undefined, t: number) => {
  const d = latestDate(uk);
  if (!uk || !other || !d) return null;
  const a = rateSA(uk, d, t);
  const b = rateSA(other, dateOnOrBefore(other, d), t);
  return a == null || b == null ? null : (a - b) * 100;
};

export default async function FxPage() {
  await connection();
  const [{ fx, cot }, { curves }, news] = await Promise.all([loadFx(), loadMarket(), getNews()]);
  const series = Object.fromEntries(FX_SERIES.map((s) => [s.id, fxSeries(fx, s.id)])) as Record<(typeof FX_SERIES)[number]["id"], Point[]>;
  const last = (id: keyof typeof series) => series[id][series[id].length - 1];
  const since = addDays(last("GBPUSD")?.[0] ?? new Date().toISOString().slice(0, 10), -3 * 365);

  const tiles: FxTile[] = FX_SERIES.map((s) => ({
    id: s.id,
    name: s.name,
    digits: s.digits,
    value: last(s.id)?.[1] ?? null,
    date: last(s.id)?.[0],
    chg1w: pctChange(series[s.id], 7),
    chg1m: pctChange(series[s.id], 31),
    ytd: pctChange(series[s.id], "ytd"),
    spark: series[s.id].slice(-63),
    history: series[s.id],
    tvSymbol: TV_SYMBOL[s.id],
  }));

  const uk = curves.uk_nominal;
  const pairs: RatesFxPair[] = [
    { id: "usd", title: "GBP/USD", fxName: "GBP/USD", spreadName: "UK − US 2y", fx: series.GBPUSD, spread: spreadSeries(uk, curves.us_ust, since) },
    { id: "eur", title: "GBP/EUR", fxName: "GBP/EUR", spreadName: "UK − Germany 2y", fx: series.GBPEUR, spread: spreadSeries(uk, curves.de_bund, since) },
  ].map((p) => ({ ...p, fx: p.fx.filter(([d]) => d >= since), corr: rollingCorrelation(p.fx, p.spread, 63) }));

  const volRows = FX_SERIES.filter((s) => s.id !== "ERI").map((s) => {
    const roll = rollingVol(series[s.id].slice(-315), 63).slice(-252).map((p) => p[1]);
    return { ...s, v1m: realisedVol(series[s.id], 21), v3m: realisedVol(series[s.id], 63), lo: roll.length ? Math.min(...roll) : null, hi: roll.length ? Math.max(...roll) : null };
  });
  const volChart = (["GBPUSD", "GBPEUR"] as const).map((id, i) => ({
    key: id,
    name: `${FX_SERIES.find((s) => s.id === id)!.name} 3m`,
    color: `var(--series-${i + 1})`,
    points: rollingVol(series[id].filter(([d]) => d >= addDays(since, -120)), 63).filter(([d]) => d >= since),
  }));

  const carry = [
    { pair: "GBP vs USD", y1: gap(uk, curves.us_ust, 1), y2: gap(uk, curves.us_ust, 2) },
    { pair: "GBP vs EUR (Bunds)", y1: gap(uk, curves.de_bund, 1), y2: gap(uk, curves.de_bund, 2) },
  ];

  const cotRows: CotSeries[] = COT_CONTRACTS.map((c) => {
    const h = cotNet(cot?.rows[c.id]);
    const a = h[h.length - 1];
    const b = h[h.length - 2];
    return {
      id: c.id,
      name: c.name,
      date: a?.date,
      assetManagers: a?.assetManagers ?? null,
      leveraged: a?.leveraged ?? null,
      amChange: a && b ? a.assetManagers - b.assetManagers : null,
      levChange: a && b ? a.leveraged - b.leveraged : null,
      amPctOi: a?.oi ? (a.assetManagers / a.oi) * 100 : null,
      levPctOi: a?.oi ? (a.leveraged / a.oi) * 100 : null,
      history: h.map(({ date, assetManagers, leveraged }) => ({ date, assetManagers, leveraged })),
    };
  });

  const fxNews = news.items.filter((i) => i.topics.includes("fx")).slice(0, 10);
  const fmtGap = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(0)}bp`);

  return (
    <>
      <PageHeader title="FX">
        Sterling-focused. Levels, history and volatility use the Bank of England&apos;s daily 4pm London rates; live cards and
        the cross-rate grid are TradingView&apos;s (some feeds delayed).
      </PageHeader>
      <TickerTape />
      <div className="space-y-4">
        {fx ? <FxTiles tiles={tiles} /> : <p className="text-sm text-muted">No BoE FX data yet: run the “Update market data” GitHub Action.</p>}
        <MarketsBoard groups={["FX spot"]} />
        <div className="grid gap-4 lg:grid-cols-2">
          <RatesVsFx pairs={pairs} />
          <div className="space-y-4">
            <Card title="Realised volatility" subtitle="Annualised, from daily BoE rates. Range is the 3-month figure over the past year.">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 font-normal">Pair</th>
                    <th className="py-1 text-right font-normal">1 month</th>
                    <th className="py-1 text-right font-normal">3 months</th>
                    <th className="py-1 text-right font-normal">1y range (3m)</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {volRows.map((v) => (
                    <tr key={v.id} className="border-t border-line">
                      <td className="py-1.5 text-ink">{v.name}</td>
                      <td className="py-1.5 text-right text-ink">{v.v1m == null ? "–" : `${v.v1m.toFixed(1)}%`}</td>
                      <td className="py-1.5 text-right text-ink">{v.v3m == null ? "–" : `${v.v3m.toFixed(1)}%`}</td>
                      <td className="py-1.5 text-right text-ink-2">{v.lo == null || v.hi == null ? "–" : `${v.lo.toFixed(1)} – ${v.hi.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3">
                <SeriesChart series={volChart} xKind="date" unit="pct" height={180} />
              </div>
            </Card>
            <Card title="Carry: government yield gap" subtitle="UK minus US / German government yields (semi-annual basis). Positive = sterling earns more." exportable={false}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 font-normal">Pair</th>
                    <th className="py-1 text-right font-normal">1 year</th>
                    <th className="py-1 text-right font-normal">2 years</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {carry.map((c) => (
                    <tr key={c.pair} className="border-t border-line">
                      <td className="py-1.5 text-ink">{c.pair}</td>
                      <td className="py-1.5 text-right text-ink">{fmtGap(c.y1)}</td>
                      <td className="py-1.5 text-right text-ink">{fmtGap(c.y2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
        <Positioning rows={cotRows} />
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Cross rates" subtitle="Live, from TradingView. Click a rate for its chart." exportable={false}>
            <TradingViewWidget widget="forex-cross-rates" height={400} chartPath="/charts" lazy config={{ width: "100%", height: 400, currencies: CURRENCIES }} />
          </Card>
          <Card title="Currency strength" subtitle="Each cell is the row currency's move against the column currency today." exportable={false}>
            <TradingViewWidget widget="forex-heat-map" height={400} chartPath="/charts" lazy config={{ width: "100%", height: 400, currencies: CURRENCIES }} />
          </Card>
        </div>
        <Card title="FX news" exportable={false}>
          <HeadlineList items={fxNews} />
        </Card>
      </div>
    </>
  );
}
