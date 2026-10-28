import { getText } from "./http";

// French government bond yields, daily. The ECB's FM dataset only has euro-area aggregates,
// so these come from Stooq's free daily CSVs (symbols like "10fry.b" = France 10-year).

export interface FrYields {
  /** tenor (years) → [date, yield %][] */
  series: Record<string, [string, number][]>;
  keys: Record<string, string>;
}

/** Stooq daily CSV: Date,Open,High,Low,Close[,Volume]. */
export function parseStooqCsv(csv: string): [string, number][] {
  const lines = csv.trim().split(/\r?\n/);
  if (!/^date,/i.test(lines[0] ?? "")) throw new Error(`unexpected reply: ${lines[0]?.slice(0, 60)}`);
  const h = lines[0].toLowerCase().split(",");
  const ci = h.indexOf("close");
  return lines.slice(1).flatMap((l) => {
    const c = l.split(",");
    const v = Number(c[ci]);
    return /^\d{4}-\d{2}-\d{2}$/.test(c[0]) && Number.isFinite(v) ? [[c[0], v] as [string, number]] : [];
  });
}

export async function fetchFrenchYields(since: string): Promise<FrYields> {
  const out: FrYields = { series: {}, keys: {} };
  const errors: string[] = [];
  const d1 = since.replace(/-/g, "");
  for (const t of [2, 5, 10, 30]) {
    const sym = `${t}fry.b`;
    try {
      const pts = parseStooqCsv(await getText(`https://stooq.com/q/d/l/?s=${sym}&i=d&d1=${d1}`, "text/csv"));
      if (pts.length < 20) throw new Error(`only ${pts.length} rows`);
      out.series[String(t)] = pts;
      out.keys[String(t)] = `Stooq ${sym}`;
      console.log(`  France ${t}y (Stooq ${sym}): ${pts.length} rows, last ${pts.at(-1)!.join(" ")}`);
    } catch (e) {
      errors.push(`${sym}: ${(e as Error).message}`);
    }
  }
  if (!Object.keys(out.series).length) throw new Error(errors.join("; "));
  if (errors.length) console.log(`  France: some tenors failed: ${errors.join("; ")}`);
  return out;
}
