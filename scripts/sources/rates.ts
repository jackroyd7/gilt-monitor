import { parseFredCsv } from "../../lib/macro";
import { RATE_SERIES, type RatesData } from "../../lib/rates";
import { getText } from "./http";

/** FRED daily series for the Rates tab; a failed series keeps its previous data. */
export async function fetchRates(previous: RatesData | undefined, since: string) {
  const series: RatesData["series"] = { ...(previous?.series ?? {}) };
  const failures: string[] = [];
  for (const s of RATE_SERIES) {
    try {
      const pts = parseFredCsv(await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${s.fred}&cosd=${since}`, "text/csv"));
      if (!pts.length) throw new Error("no rows");
      series[s.id] = pts;
      console.log(`  ${s.id} (${s.fred}): ${pts.at(-1)!.join(" ")}`);
    } catch (e) {
      failures.push(`${s.id} ${s.fred}: ${(e as Error).message}`);
    }
  }
  return { data: { updatedAt: new Date().toISOString(), series } as RatesData, failures };
}
