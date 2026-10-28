// Writes the morning briefing to data/briefing.json with Claude and web search.
// Runs from the "Morning briefing" GitHub Action; needs ANTHROPIC_API_KEY.
//
//   npm run briefing             # only between 06:00 and 08:59 London time on weekdays
//   npm run briefing -- --force  # any time

import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { headlineMetrics, rateSA, tile } from "../lib/analytics";
import { dateOnOrBefore, latestDate } from "../lib/curve";
import { BRIEFING_SYSTEM, londonClock, wordCount, type Briefing } from "../lib/briefing";
import { FX_SERIES, fxSeries, pctChange, type FxHistory } from "../lib/fx";
import { periodLabel, type MacroData } from "../lib/macro";
import { mergeItems, parseFeed, type NewsItem } from "../lib/news";
import { INDICATORS, ECONOMIES } from "../config/macro";
import type { CurveId, CurveSet } from "../lib/types";
import { getText } from "./sources/http";

const DATA = path.resolve(process.env.DATA_DIR ?? "data");
const readJson = async <T>(f: string) => {
  try {
    return JSON.parse(await readFile(path.join(DATA, f), "utf8")) as T;
  } catch {
    return undefined;
  }
};

// Headlines since yesterday morning, for context (the model also searches).
const QUERIES = [
  "gilts OR \"gilt yields\" OR \"Bank of England\"",
  "\"Treasury yields\" OR \"Federal Reserve\" OR \"bond market\"",
  "ECB OR \"Bund yields\" OR \"euro zone bonds\"",
  "\"FTSE 100\" OR \"European stocks\" OR \"Wall Street\" OR \"stock market\"",
  "sterling OR dollar OR \"currency markets\"",
  "\"oil prices\" OR Brent OR gold OR \"commodity prices\"",
  "UK politics economy OR Chancellor OR Treasury",
  "geopolitics markets OR tariffs OR sanctions",
];

async function headlines(): Promise<NewsItem[]> {
  const lists = await Promise.allSettled(
    QUERIES.map(async (q) =>
      parseFeed(await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:1d`)}&hl=en-GB&gl=GB&ceid=GB:en`), "brief"),
    ),
  );
  return mergeItems(lists.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])))
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, 60);
}

async function marketContext(): Promise<string> {
  const lines: string[] = [];
  const curves: Partial<Record<CurveId, CurveSet>> = {};
  for (const id of ["uk_nominal", "uk_real", "uk_inflation", "uk_ois", "de_bund", "us_ust"] as CurveId[]) {
    const c = await readJson<CurveSet>(`curves/${id}.json`);
    if (c) curves[id] = c;
  }
  lines.push(`UK gilt curve (BoE fitted, close ${latestDate(curves.uk_nominal) ?? "n/a"}):`);
  for (const m of headlineMetrics(curves)) {
    const t = tile(m);
    if (t.value == null) continue;
    lines.push(`- ${t.label}: ${t.unit === "pct" ? `${t.value.toFixed(2)}%` : `${t.value.toFixed(0)}bp`} (1d ${t.chg1d?.toFixed(1) ?? "n/a"}bp, 1w ${t.chg1w?.toFixed(1) ?? "n/a"}bp)`);
  }
  for (const [id, name] of [["de_bund", "Bund"], ["us_ust", "US Treasury"]] as const) {
    const d = latestDate(curves[id]);
    if (!d || !curves[id]) continue;
    const prev = dateOnOrBefore(curves[id]!, new Date(Date.parse(d) - 86_400_000).toISOString().slice(0, 10));
    const cur = [2, 10, 30].map((t) => `${t}y ${rateSA(curves[id], d, t)?.toFixed(2) ?? "n/a"}%`);
    const chg = rateSA(curves[id], d, 10) != null && prev ? ((rateSA(curves[id], d, 10)! - rateSA(curves[id], prev, 10)!) * 100).toFixed(1) : "n/a";
    lines.push(`${name} (close ${d}): ${cur.join(", ")}; 10y 1d ${chg}bp`);
  }
  const fx = await readJson<FxHistory>("fx.json");
  if (fx) {
    const parts = FX_SERIES.map((s) => {
      const pts = fxSeries(fx, s.id);
      const last = pts[pts.length - 1];
      return last ? `${s.name} ${last[1].toFixed(s.digits)} (1w ${pctChange(pts, 7)?.toFixed(2) ?? "n/a"}%)` : "";
    }).filter(Boolean);
    lines.push(`Sterling, BoE 4pm rates (${Object.keys(fx.rows).sort().pop()}): ${parts.join("; ")}`);
  }
  const macro = await readJson<MacroData>("macro.json");
  if (macro) {
    lines.push("Latest official data (value, period):");
    for (const ind of INDICATORS) {
      const cells = ECONOMIES.flatMap((e) => {
        const s = macro.series[`${ind.id}.${e.id}`];
        const p = s?.points[s.points.length - 1];
        return s && p ? [`${e.name} ${p[1].toFixed(1)} (${periodLabel(p[0], s.freq)})`] : [];
      });
      if (cells.length) lines.push(`- ${ind.label}: ${cells.join("; ")}`);
    }
  }
  return lines.join("\n");
}

async function main() {
  const now = londonClock();
  const force = process.argv.includes("--force");
  if (!force && (now.weekday === 0 || now.weekday === 6 || now.hour < 6 || now.hour > 8)) {
    console.log(`Not briefing time in London (${now.date} ${now.hour}:00); skipping. Use --force to run anyway.`);
    return;
  }
  const existing = await readJson<Briefing>("briefing.json");
  if (!force && existing?.date === now.date) {
    console.log(`Briefing for ${now.date} already written; skipping.`);
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set (add it as a GitHub Actions secret)");

  const [context, news] = await Promise.all([marketContext(), headlines()]);
  const user =
    `Today is ${new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ` +
    `${new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })} London time.\n\n` +
    `Our closing data:\n${context}\n\n` +
    `Headlines from the last 24 hours (source, time):\n${news.map((n) => `- ${n.title} (${n.source}, ${n.published.slice(0, 16).replace("T", " ")}Z)`).join("\n")}\n\n` +
    `Write today's briefing.`;

  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: user }];
  let response: Anthropic.Beta.BetaMessage | undefined;
  // Server-side web search can pause a long turn; send it back to let it continue.
  for (let i = 0; i < 5; i++) {
    response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: BRIEFING_SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10, user_location: { type: "approximate", country: "GB", city: "London", timezone: "Europe/London" } }],
      messages,
    });
    if (response.stop_reason !== "pause_turn") break;
    messages.splice(1, messages.length - 1, { role: "assistant", content: response.content });
  }
  if (!response) throw new Error("no response");
  if (response.stop_reason === "refusal") throw new Error("the model declined to write the briefing");
  if (response.stop_reason === "pause_turn") throw new Error("briefing did not finish after 5 continuations");

  const textBlocks = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text");
  // The final answer starts at the first heading; earlier text is the model narrating its searches.
  let markdown = textBlocks.map((b) => b.text).join("");
  const start = markdown.indexOf("## ");
  if (start > 0) markdown = markdown.slice(start);
  markdown = markdown.trim();
  if (!markdown) throw new Error("empty briefing");

  const sources = new Map<string, string>();
  for (const b of textBlocks)
    for (const c of b.citations ?? []) if (c.type === "web_search_result_location" && c.url && !sources.has(c.url)) sources.set(c.url, c.title ?? c.url);

  const briefing: Briefing = {
    generatedAt: new Date().toISOString(),
    date: now.date,
    markdown,
    sources: [...sources].slice(0, 20).map(([url, title]) => ({ url, title })),
  };
  await writeFile(path.join(DATA, "briefing.json"), JSON.stringify(briefing, null, 2) + "\n");
  const u = response.usage;
  console.log(`Briefing for ${now.date}: ${wordCount(markdown)} words, ${briefing.sources.length} sources; tokens in ${u.input_tokens} out ${u.output_tokens}, searches ${u.server_tool_use?.web_search_requests ?? 0}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
