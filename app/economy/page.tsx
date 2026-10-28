import { connection } from "next/server";
import MacroBoard, { ImfTables, type ImfTable, type MacroRow } from "@/components/MacroBoard";
import { PageHeader } from "@/components/Tiles";
import { ECONOMIES, IMF_ECONOMIES, IMF_INDICATORS, INDICATORS } from "@/config/macro";
import { loadMacro } from "@/lib/data";
import { periodLabel } from "@/lib/macro";

export const metadata = { title: "Economy · Markets Monitor" };

export default async function EconomyPage() {
  await connection();
  const macro = await loadMacro();
  if (!macro) {
    return (
      <PageHeader title="Economy">
        No economic data yet: it arrives with the next run of the “Update market data” GitHub Action.
      </PageHeader>
    );
  }
  const staleBefore = new Date(Date.parse(macro.updatedAt) - 548 * 86_400_000).toISOString().slice(0, 10);
  const rows: MacroRow[] = INDICATORS.map((ind) => ({
    id: ind.id,
    label: ind.label,
    group: ind.group,
    unit: ind.unit,
    cells: Object.fromEntries(
      ECONOMIES.map((e) => {
        const s = macro.series[`${ind.id}.${e.id}`];
        const pts = s?.points ?? [];
        // Hide series that have stopped updating (e.g. discontinued upstream).
        if (!s || !pts.length || pts[pts.length - 1][0] < staleBefore) return [e.id, undefined];
        const [d, v] = pts[pts.length - 1];
        return [
          e.id,
          { value: v, prev: pts.length > 1 ? pts[pts.length - 2][1] : null, period: periodLabel(d, s.freq), source: s.source, note: s.note, spark: pts.slice(s.freq === "Q" ? -12 : -24), history: pts },
        ];
      }),
    ),
  })).filter((r) => Object.values(r.cells).some(Boolean));

  const thisYear = new Date().getUTCFullYear();
  const years = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1].map(String);
  const tables: ImfTable[] = IMF_INDICATORS.filter((i) => macro.imf[i.code]).map((i) => ({
    code: i.code,
    label: i.label,
    years,
    rows: IMF_ECONOMIES.map((c) => ({ name: c.name, values: years.map((y) => macro.imf[i.code]?.[c.code]?.[y] ?? null) })),
  }));

  return (
    <>
      <PageHeader title="Economy">
        Key economic data for the UK, US, euro area, Germany, France and Japan, from the ONS, FRED (US Bureau of Labor
        Statistics, BEA, Eurostat and OECD series), the Bank of England and the IMF. Updated with the daily data job. Click
        an indicator to compare its history across economies.
      </PageHeader>
      <div className="space-y-4">
        <MacroBoard rows={rows} economies={ECONOMIES.map((e) => ({ id: e.id, name: e.name }))} />
        {tables.length > 0 && <ImfTables tables={tables} firstForecast={String(thisYear)} />}
      </div>
    </>
  );
}
