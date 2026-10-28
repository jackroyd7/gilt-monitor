// One-off: gilt-history yields recorded from giltsyield.com were annual-compounded. For each
// date, compare conventional yields with the semi-annual yield from the same clean price; if
// the day is clearly on the annual basis (median gap > 3bp), convert every yield that day.
//   npx tsx scripts/migrate-yield-basis.ts [data dir]

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { giltYieldFromClean, parseCoupon } from "../lib/bond";
import { historyJson } from "../lib/history";
import { annualToSemiannual } from "../lib/live-parse";
import type { GiltHistory } from "../lib/types";

async function main() {
  const file = path.join(path.resolve(process.argv[2] ?? "data"), "gilt-history.json");
  const hist = JSON.parse(await readFile(file, "utf8")) as GiltHistory;
  let converted = 0;
  let kept = 0;
  for (const d of Object.keys(hist.rows).sort()) {
    const gaps: number[] = [];
    for (const [isin, [clean, y]] of Object.entries(hist.rows[d])) {
      const g = hist.gilts[isin];
      const c = g ? parseCoupon(g.name) : null;
      if (g?.type !== "conventional" || clean == null || y == null || c == null) continue;
      const calc = giltYieldFromClean(clean, c, g.maturity, d);
      if (calc && (Date.parse(g.maturity) - Date.parse(d)) / 3.156e10 > 1) gaps.push((y - calc.yield) * 100);
    }
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    if (gaps.length >= 10 && median > 3) {
      for (const r of Object.values(hist.rows[d])) if (r[1] != null) r[1] = +annualToSemiannual(r[1]).toFixed(4);
      converted++;
    } else kept++;
  }
  await writeFile(file, historyJson(hist));
  console.log(`${converted} days converted to semi-annual, ${kept} left as they were`);
}

main();
