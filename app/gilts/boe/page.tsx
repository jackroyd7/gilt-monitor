import { connection } from "next/server";
import { SeriesChart } from "@/components/charts";
import { Card, PageHeader } from "@/components/Tiles";
import { loadMarket, loadPolicy } from "@/lib/data";
import { policyView } from "@/lib/policy-view";

export const metadata = { title: "BoE rate path · Markets Monitor" };

const bp = (v: number | null, d = 0) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`);

export default async function BoePage() {
  await connection();
  const [{ curves }, policy] = await Promise.all([loadMarket(), loadPolicy()]);
  const v = policyView(curves.uk_ois_fwd, policy);
  if (!v) {
    return (
      <PageHeader title="BoE rate path">
        No data yet: the SONIA forward curve, Bank Rate and MPC dates arrive with the next run of the “Update market data”
        GitHub Action.
      </PageHeader>
    );
  }
  return (
    <>
      <PageHeader title="BoE rate path">
        Where the SONIA swap market prices Bank Rate after each Monetary Policy Committee meeting, from the Bank of
        England&apos;s daily OIS forward curve (close {v.curveDate}). Bank Rate {v.bank.toFixed(2)}%
        {v.sonia != null && <>, SONIA {v.sonia.toFixed(4)}%</>}.
      </PageHeader>
      <div className="space-y-4">
        {v.next && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card p-3">
              <div className="text-xs text-ink-2">Next MPC · {v.next.label}</div>
              <div className="mt-1 text-2xl font-semibold text-ink">{bp(v.next.change)}bp</div>
              <div className="text-xs text-ink-2">
                {Math.abs(v.next.change) < 2 ? "no change priced" : `≈ ${v.next.odds.toFixed(0)}% chance of a 25bp ${v.next.change < 0 ? "cut" : "hike"}`}
              </div>
            </div>
            {v.end && (
              <div className="card p-3">
                <div className="text-xs text-ink-2">Priced by {v.end.label}</div>
                <div className="mt-1 text-2xl font-semibold text-ink">{v.end.rate.toFixed(2)}%</div>
                <div className="text-xs text-ink-2">{bp(v.end.cumulative)}bp from today ({(Math.abs(v.end.cumulative) / 25).toFixed(1)} × 25bp {v.end.cumulative < 0 ? "cuts" : "hikes"})</div>
              </div>
            )}
            <div className="card p-3">
              <div className="text-xs text-ink-2">Bank Rate now</div>
              <div className="mt-1 text-2xl font-semibold text-ink">{v.bank.toFixed(2)}%</div>
              <div className="text-xs text-ink-2">SONIA {v.sonia?.toFixed(2) ?? "–"}%</div>
            </div>
          </div>
        )}
        <Card title="Implied Bank Rate path" subtitle="Monthly, from the SONIA forward curve plus today's Bank Rate − SONIA gap: today against a week and a month ago.">
          <SeriesChart series={v.series} xKind="date" unit="pct" height={300} defaultRange="All" />
        </Card>
        <Card title="By MPC meeting" subtitle={`Implied Bank Rate after each announcement (${v.knownDates} upcoming dates known from the BoE). Changes in bp.`}>
          {v.meetings.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-normal">Meeting</th>
                  <th className="py-1 text-right font-normal">Implied rate</th>
                  <th className="py-1 text-right font-normal">At meeting</th>
                  <th className="py-1 text-right font-normal">From today</th>
                  <th className="py-1 text-right font-normal">1w chg</th>
                  <th className="py-1 text-right font-normal">1m chg</th>
                </tr>
              </thead>
              <tbody className="num">
                {v.meetings.map((m) => (
                  <tr key={m.date} className="border-t border-line">
                    <td className="py-1.5 text-ink">{m.label}</td>
                    <td className="py-1.5 text-right text-ink">{m.rate.toFixed(2)}%</td>
                    <td className="py-1.5 text-right text-ink-2">{bp(m.change, 1)}</td>
                    <td className="py-1.5 text-right font-medium text-ink">{bp(m.cumulative, 1)}</td>
                    <td className="py-1.5 text-right text-ink-2">{bp(m.w1, 1)}</td>
                    <td className="py-1.5 text-right text-ink-2">{bp(m.m1, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">No upcoming MPC dates known yet.</p>
          )}
          <p className="mt-3 text-xs text-muted">
            Market pricing, not a forecast: forwards include a small term premium, and the &ldquo;chance of a cut&rdquo; is
            the priced move divided by 25bp. The BoE fits its OIS curve each day after the close, so this updates daily.
          </p>
        </Card>
      </div>
    </>
  );
}
