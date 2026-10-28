import { connection } from "next/server";
import { CarryTable, ForwardsPanel, ScreensPanel, type CarryRow } from "@/components/RvPanels";
import { PageHeader } from "@/components/Tiles";
import { giltRows, rateSA } from "@/lib/analytics";
import { addDays, dateOnOrBefore, latestDate, sortedDates } from "@/lib/curve";
import { loadMacro, loadMarketWithLive } from "@/lib/data";
import { giltForward, giltYieldFromClean } from "@/lib/bond";

import { FWD_HORIZONS, carryRoll, forwardRate, forwardStartingCurve, KEY_FORWARDS, oneYearForwards, zScore } from "@/lib/rv";
import { rvHistory } from "@/lib/rv-data";

export const metadata = { title: "Relative value · Markets Monitor" };

const shortName = (n: string) => n.replace(/Treasury (Gilt|Stock)\s*/i, "").trim();

export default async function RvPage() {
  await connection();
  const [market, macro] = await Promise.all([loadMarketWithLive(), loadMacro()]);
  const { rows, fit, asOf } = giltRows(market.gilts, market.curves);
  const nominal = market.curves.uk_nominal;

  // Forwards from the BoE nominal zero curve.
  const d = latestDate(nominal);
  const d1m = nominal && d ? dateOnOrBefore(nominal, addDays(d, -30)) : undefined;
  const spot: [number, number][] =
    nominal && d
      ? nominal.tenors
          .filter((t) => t >= 0.5 && t <= 40)
          .flatMap((t) => {
            const r = rateSA(nominal, d, t);
            return r == null ? [] : [[t, +r.toFixed(4)] as [number, number]];
          })
      : [];
  const fwdCurves =
    nominal && d
      ? [
          { key: "spot", name: "Spot (zero)", color: "var(--series-1)", points: spot },
          { key: "f1", name: "Curve in 1 year", color: "var(--series-2)", points: forwardStartingCurve(nominal, d, 1) },
          { key: "f5", name: "Curve in 5 years", color: "var(--series-3)", points: forwardStartingCurve(nominal, d, 5) },
          { key: "f1y", name: "1-year forward rates", color: "var(--series-4)", dashed: true, points: oneYearForwards(nominal, d) },
        ]
      : [];
  // Key forwards now and a month ago, with two years of daily history for charting.
  const fwdSince = d ? addDays(d, -2 * 365) : "";
  const fwdTable = KEY_FORWARDS.map((k) => ({
    label: k.label,
    now: nominal && d ? forwardRate(nominal, d, k.start, k.start + k.len) : null,
    m1: nominal && d1m ? forwardRate(nominal, d1m, k.start, k.start + k.len) : null,
    history: nominal
      ? sortedDates(nominal)
          .filter((x) => x >= fwdSince)
          .flatMap((x) => {
            const v = forwardRate(nominal, x, k.start, k.start + k.len);
            return v == null ? [] : [[x, +v.toFixed(4)] as [string, number]];
          })
      : [],
  }));

  // Repo proxy: Bank Rate from the economic data, else the shortest SONIA OIS point.
  const bank = macro?.series["policy.UK"]?.points.at(-1)?.[1];
  const ois = market.curves.uk_ois;
  const oisDate = latestDate(ois);
  const oisShort = ois && oisDate ? rateSA(ois, oisDate, ois.tenors[0]) : null;
  const repo = bank ?? oisShort ?? 4;
  const repoLabel = bank != null ? "Bank Rate" : oisShort != null ? `SONIA OIS ${ois!.tenors[0]}y` : "assumed";

  const conv = rows.filter((r) => r.type === "conventional" && !r.outlier && r.yield != null && r.modDuration != null && r.years > 0.75);
  const { residuals, switches, flies } = rvHistory(
    market.history,
    conv.map((r) => ({ isin: r.isin, name: r.name, years: r.years })),
  );
  const carry: CarryRow[] = fit
    ? conv.flatMap((r) => {
        const cr = carryRoll(r.yield!, r.years, r.modDuration!, fit, repo);
        if (!cr) return [];
        const rc = residuals.get(r.isin) ?? [];
        return [
          {
            isin: r.isin,
            name: shortName(r.name),
            maturity: r.maturity,
            years: r.years,
            yield: r.yield!,
            modDuration: r.modDuration!,
            carryBp: cr.carryBp,
            rollBp: cr.rollBp,
            breakevenBp: cr.breakevenBp,
            totalPct: cr.totalPct,
            richCheap: r.richCheap,
            rcZ: zScore(rc, 252),
            rcHistory: rc,
            // Forward yields for settlement in 3, 6 and 12 months, financed at the repo proxy.
            // The forward − spot move is measured on our own price→yield maths (both legs from
            // the clean price), then added to the quoted yield, so it is consistent even when the
            // source's yield and price differ by a few bp.
            fwd: Object.fromEntries(
              FWD_HORIZONS.map((h) => {
                if (r.cleanPrice == null || r.coupon == null || !asOf) return [h.id, null];
                const spotCalc = giltYieldFromClean(r.cleanPrice, r.coupon, r.maturity, asOf);
                const fwd = giltForward(r.cleanPrice, r.coupon, r.maturity, asOf, repo, h.days);
                return [h.id, spotCalc && fwd ? r.yield! + (fwd.yield - spotCalc.yield) : null];
              }),
            ),
          },
        ];
      })
    : [];
  const strip = (s: (typeof switches)[number]) => ({ id: s.id, label: s.label, value: s.value, chg1m: s.chg1m, z3m: s.z3m, z1y: s.z1y, series: s.series });

  return (
    <>
      <PageHeader title="Relative value">
        Forwards, carry and roll-down, rich/cheap against a fitted curve, and switch and butterfly screens for conventional
        gilts. Prices are intraday where available; history is daily closes.
      </PageHeader>
      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <ForwardsPanel curves={fwdCurves} table={fwdTable} />
          <ScreensPanel
            switches={switches.slice(0, 60).map(strip)}
            flies={flies.slice(0, 60).map(strip)}
            gilts={conv.slice().sort((a, b) => a.years - b.years).map((r) => ({ isin: r.isin, name: shortName(r.name) }))}
          />
        </div>
        {carry.length ? <CarryTable rows={carry} repo={repo} repoLabel={repoLabel} /> : <p className="text-sm text-muted">No gilt prices yet.</p>}
      </div>
    </>
  );
}
