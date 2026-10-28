import { getText } from "./http";

// French government benchmark bond yields, daily, from the ECB data portal's financial
// markets dataset (FM). The series keys aren't documented to us, so we ask for every daily
// French yield series and pick the 2/5/10/30-year benchmarks by their key.

export interface FrYields {
  /** tenor (years) → [date, yield %][] */
  series: Record<string, [string, number][]>;
  keys: Record<string, string>;
}

export async function fetchFrenchYields(since: string): Promise<FrYields> {
  const url = `https://data-api.ecb.europa.eu/service/data/FM/D.FR.EUR....YLD?format=csvdata&startPeriod=${since}`;
  const csv = await getText(url, "text/csv");
  const lines = csv.trim().split(/\r?\n/).map((l) => l.split(","));
  const h = lines[0] ?? [];
  const ki = h.indexOf("KEY");
  const ti = h.indexOf("TIME_PERIOD");
  const vi = h.indexOf("OBS_VALUE");
  if (ki < 0 || ti < 0 || vi < 0) throw new Error(`unexpected ECB header: ${h.slice(0, 8).join(",")}`);
  const byKey = new Map<string, [string, number][]>();
  for (const l of lines.slice(1)) {
    const v = Number(l[vi]);
    if (!l[ki] || !/^\d{4}-\d{2}-\d{2}$/.test(l[ti]) || l[vi] === "" || !Number.isFinite(v)) continue;
    byKey.set(l[ki], [...(byKey.get(l[ki]) ?? []), [l[ti], v]]);
  }
  console.log(`  ECB FM daily French yield series: ${[...byKey.keys()].map((k) => `${k} (${byKey.get(k)!.length}, last ${byKey.get(k)!.at(-1)!.join(" ")})`).join("; ") || "none"}`);
  const out: FrYields = { series: {}, keys: {} };
  for (const t of [2, 5, 10, 30]) {
    // Benchmark ids look like "FR10YT_RR"; take the key naming this maturity.
    const key = [...byKey.keys()].find((k) => new RegExp(`[._]FR${t}Y`, "i").test(k)) ?? [...byKey.keys()].find((k) => new RegExp(`(^|[._])${t}Y`, "i").test(k));
    if (key) {
      out.series[String(t)] = byKey.get(key)!.sort((a, b) => a[0].localeCompare(b[0]));
      out.keys[String(t)] = key;
    }
  }
  if (!Object.keys(out.series).length) throw new Error("no French benchmark yields found in ECB FM");
  return out;
}
