import { IMF_ECONOMIES, IMF_INDICATORS, INDICATORS, type SeriesSpec } from "../../config/macro";
import { parseIadbCsv } from "../../lib/fx";
import { inferFreq, monthlyLast, parseEcbCsv, parseFredCsv, parseImf, parseOns, transform, type MacroData, type MacroSeries, type Point } from "../../lib/macro";
import { getText } from "./http";

const SINCE = "2012-01-01";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function download(spec: SeriesSpec): Promise<{ title: string; source: string; points: Point[] }> {
  if (spec.source === "ons") {
    const [path, cdid, dataset] = [spec.id.split("/").slice(0, -2).join("/"), ...spec.id.split("/").slice(-2)];
    const r = parseOns(JSON.parse(await getText(`https://www.ons.gov.uk/${path}/timeseries/${cdid}/${dataset}/data`, "application/json")));
    return { title: r.title, source: `ONS ${cdid.toUpperCase()}`, points: r.points };
  }
  if (spec.source === "fred") {
    const csv = await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${spec.id}&cosd=${SINCE}`, "text/csv");
    return { title: spec.id, source: `FRED ${spec.id}`, points: parseFredCsv(csv) };
  }
  if (spec.source === "ecb") {
    const [flow, key] = spec.id.split("/");
    const csv = await getText(`https://data-api.ecb.europa.eu/service/data/${flow}/${key}?format=csvdata&startPeriod=${SINCE.slice(0, 7)}`, "text/csv");
    return { title: spec.id, source: `ECB ${flow}`, points: parseEcbCsv(csv) };
  }
  const from = `01/${MON[0]}/${SINCE.slice(0, 4)}`;
  const url = `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${from}&Dateto=now&SeriesCodes=${spec.id}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  const rows = parseIadbCsv(await getText(url, "text/csv"), [spec.id]);
  return {
    title: spec.id,
    source: `BoE ${spec.id}`,
    points: Object.keys(rows).sort().flatMap((d) => (rows[d][0] == null ? [] : [[d, rows[d][0]!] as Point])),
  };
}

/**
 * Downloads every configured series (one request each, a few at a time), applies its
 * transform and keeps ~12 years. A failed series keeps its previous data.
 */
export async function fetchMacro(previous?: MacroData): Promise<{ data: MacroData; failures: string[] }> {
  // Start from the previous file, minus indicators no longer configured.
  const wanted = new Set(INDICATORS.flatMap((i) => Object.keys(i.series).map((e) => `${i.id}.${e}`)));
  const series: Record<string, MacroSeries> = Object.fromEntries(Object.entries(previous?.series ?? {}).filter(([k]) => wanted.has(k)));
  const failures: string[] = [];
  const jobs = INDICATORS.flatMap((ind) => Object.entries(ind.series).map(([eco, spec]) => ({ key: `${ind.id}.${eco}`, spec: spec! })));
  const cache = new Map<string, Promise<Awaited<ReturnType<typeof download>>>>();
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < jobs.length) {
        const { key, spec } = jobs[next++];
        try {
          // The same download can feed two indicators (e.g. GDP q/q and y/y).
          const id = `${spec.source}:${spec.id}`;
          if (!cache.has(id)) cache.set(id, download(spec));
          const raw = await cache.get(id)!;
          let pts = raw.points.filter(([d]) => d >= SINCE).map(([d, v]) => [d, v * (spec.scale ?? 1)] as Point);
          let freq = inferFreq(pts);
          if (freq === "D") {
            pts = monthlyLast(pts);
            freq = "M";
          }
          const points = transform(pts, spec.transform, freq).map(([d, v]) => [d, +v.toFixed(3)] as Point);
          if (!points.length) throw new Error("no observations after transform");
          series[key] = { title: raw.title, source: raw.source, freq, note: spec.note, points };
          const [d, v] = points[points.length - 1];
          console.log(`  ${key}: ${raw.source} "${raw.title}" → ${d} ${v} (${freq}, ${points.length} pts)`);
        } catch (e) {
          failures.push(`${key} (${spec.source} ${spec.id}): ${(e as Error).message}`);
          console.warn(`  ${key} FAILED ${spec.source} ${spec.id}: ${(e as Error).message}`);
        }
      }
    }),
  );

  let imf = previous?.imf ?? {};
  try {
    const codes = IMF_ECONOMIES.map((c) => c.code).join("/");
    const parts = await Promise.all(
      IMF_INDICATORS.map(async (i) => parseImf(JSON.parse(await getText(`https://www.imf.org/external/datamapper/api/v1/${i.code}/${codes}`, "application/json")))),
    );
    const merged = Object.assign({}, ...parts) as MacroData["imf"];
    for (const i of IMF_INDICATORS) console.log(`  IMF ${i.code}: ${Object.keys(merged[i.code] ?? {}).join(", ") || "none"}`);
    if (Object.keys(merged).length) imf = merged;
  } catch (e) {
    failures.push(`IMF: ${(e as Error).message}`);
    console.warn(`  IMF FAILED: ${(e as Error).message}`);
  }
  return { data: { updatedAt: new Date().toISOString(), series, imf }, failures };
}
