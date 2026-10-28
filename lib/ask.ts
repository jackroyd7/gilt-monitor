import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SECTOR_OF } from "@/config/sectors";
import { STOCKS } from "@/config/stock-catalogue";
import { anthropicKey, marketContext } from "./briefing-gen";
import type { CommodityData } from "./commodities";
import { COMMODITY_COT, COMMODITY_SERIES } from "./commodities";
import { addDays, latestDate } from "./curve";
import { loadMarket } from "./data";
import { cotNet, COT_CONTRACTS, type CotHistory } from "./fx";
import type { PolicyData } from "./policy";
import { policyView } from "./policy-view";
import { RATE_SERIES, type RatesData } from "./rates";
import { spreadSeries } from "./rates-spreads";
import { changeSince } from "./rv";
import type { StockQuotes } from "./stocks";

// "Ask about this page": a short AI answer grounded in our data for the tab you're on,
// with a few web searches for the news behind a move.

/** Longest answer, in words. Set here on the server and written into the system prompt. */
export const ANSWER_WORDS = 300;

const SYSTEM = `You answer quick questions from a UK-based professional investor using a markets dashboard covering gilts and UK rates, global government bonds, equities, FX, commodities and the economy.
Answer in at most ${ANSWER_WORDS} words (shorter is fine when the question is simple), plainly, in British English. Lead with the direct answer. Use the dashboard data supplied (it is the latest end-of-day data unless stated) and cite numbers from it with units (bp, %). Use web search only when the question needs news or explanation beyond the data, and only a few searches. If the data and searches don't support an answer, say so briefly rather than guess. No headings, no bullet lists unless essential, no preamble.`;

const dataDir = () => path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR ?? "data");
const readJson = async <T>(f: string) => {
  try {
    return JSON.parse(await readFile(path.join(dataDir(), f), "utf8")) as T;
  } catch {
    return undefined;
  }
};
const bp = (v: number | null) => (v == null ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(0)}bp`);

/** Extra data for the page the question was asked on. */
async function pageContext(page: string): Promise<string> {
  const lines: string[] = [];
  const { curves } = await loadMarket();
  if (page.startsWith("/rates") || page.startsWith("/gilts")) {
    const rates = await readJson<RatesData>("rates.json");
    const since = addDays(latestDate(curves.uk_nominal) ?? "2020-01-01", -400);
    lines.push("Curve slopes and spreads (level; 1-week, 1-month and 3-month change):");
    for (const [id, name] of [
      ["slope:uk_nominal:2:10", "UK 2s10s"],
      ["slope:uk_nominal:10:30", "UK 10s30s"],
      ["slope:us_ust:2:10", "US 2s10s"],
      ["slope:de_bund:2:10", "Germany 2s10s"],
      ["xm:uk-de:10", "UK−Germany 10y"],
      ["xm:uk-us:10", "UK−US 10y"],
      ["ois:10", "Gilt−SONIA OIS 10y"],
    ] as const) {
      const pts = spreadSeries(id, curves, rates, since);
      const last = pts.at(-1);
      if (last) lines.push(`- ${name}: ${last[1].toFixed(0)}bp (1w ${bp(changeSince(pts, 7))}, 1m ${bp(changeSince(pts, 31))}, 3m ${bp(changeSince(pts, 92))})`);
    }
    if (rates) {
      lines.push("US/euro rates (latest; 1-month change):");
      for (const s of RATE_SERIES) {
        const pts = (rates.series[s.id] ?? []) as [string, number][];
        const last = pts.at(-1);
        if (last) lines.push(`- ${s.name}: ${last[1].toFixed(2)}% (${last[0]}; 1m ${bp((changeSince(pts, 31) ?? 0) * 100)})`);
      }
    }
    const v = policyView(curves.uk_ois_fwd, await readJson<PolicyData>("boe-policy.json"));
    if (v) {
      lines.push(`BoE: Bank Rate ${v.bank.toFixed(2)}%. Implied Bank Rate after each MPC meeting (from the SONIA OIS curve, ${v.curveDate}):`);
      for (const m of v.meetings.slice(0, 8)) lines.push(`- ${m.label}: ${m.rate.toFixed(2)}% (${bp(m.cumulative)} from now; 1m change ${bp(m.m1)})`);
    }
  }
  if (page.startsWith("/fx")) {
    const cot = await readJson<CotHistory>("cot.json");
    for (const c of COT_CONTRACTS) {
      const h = cotNet(cot?.rows[c.id]);
      const a = h.at(-1);
      if (a) lines.push(`CFTC ${c.name} futures (${a.date}): asset managers net ${a.assetManagers}, leveraged funds net ${a.leveraged} contracts`);
    }
  }
  if (page.startsWith("/commodities")) {
    const d = await readJson<CommodityData>("commodities.json");
    for (const s of COMMODITY_SERIES) {
      const pts = (d?.prices[s.id] ?? []) as [string, number][];
      const last = pts.at(-1);
      if (last) lines.push(`${s.name}: ${last[1]} ${s.unit} (${last[0]}; 1m change ${changeSince(pts, 31)?.toFixed(2) ?? "n/a"})`);
    }
    for (const c of COMMODITY_COT) {
      const h = cotNet(d?.cot[c.id]);
      const a = h.at(-1);
      if (a) lines.push(`CFTC ${c.name} (${a.date}): managed money net ${a.assetManagers}, producers net ${a.leveraged}`);
    }
  }
  if (page.startsWith("/equities")) {
    const q = await readJson<StockQuotes>("stocks.json");
    if (q) {
      for (const group of ["UK stocks", "German stocks", "French stocks"]) {
        const by = new Map<string, number[]>();
        for (const s of STOCKS.filter((x) => x.group === group)) {
          const qq = q.quotes[s.symbol];
          const sec = SECTOR_OF[s.symbol];
          if (qq && sec) by.set(sec, [...(by.get(sec) ?? []), qq.change]);
        }
        const secs = [...by].map(([k, v]) => `${k} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}%`);
        if (secs.length) lines.push(`${group}, average move today by sector: ${secs.join(", ")}`);
      }
    }
  }
  return lines.join("\n");
}

const cache = ((globalThis as { __giltAsk?: Map<string, { at: number; answer: Answer }> }).__giltAsk ??= new Map());

export interface Answer {
  text: string;
  sources: { title: string; url: string }[];
}

/** Answers one question about a page in at most ANSWER_WORDS words. Cached for 30 minutes. */
export async function ask(page: string, question: string): Promise<Answer> {
  const apiKey = anthropicKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in Vercel.");
  const key = `${ANSWER_WORDS}|${page}|${question.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.answer;

  const [general, specific] = await Promise.all([marketContext(dataDir()), pageContext(page)]);
  const now = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Now: ${now} London time. Page: ${page}\n\nDashboard data:\n${general}\n${specific}\n\nQuestion: ${question.trim()}` },
  ];
  let response: Anthropic.Beta.BetaMessage | undefined;
  for (let i = 0; i < 3; i++) {
    response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      messages,
    });
    if (response.stop_reason !== "pause_turn") break;
    messages.splice(1, messages.length - 1, { role: "assistant", content: response.content });
  }
  if (!response || response.stop_reason === "pause_turn") throw new Error("The answer didn't finish; try again.");
  if (response.stop_reason === "refusal") throw new Error("The model declined to answer that.");
  const blocks = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text");
  // Keep the final answer: the last run of text after any tool use.
  const lastTool = response.content.map((b) => b.type).lastIndexOf("web_search_tool_result");
  const finalBlocks = blocks.filter((b) => response!.content.indexOf(b) > lastTool);
  let text = (finalBlocks.length ? finalBlocks : blocks).map((b) => b.text).join("").trim();
  const words = text.split(/\s+/);
  // Backstop if the model runs over the limit in the prompt.
  if (words.length > ANSWER_WORDS * 1.07) text = `${words.slice(0, ANSWER_WORDS).join(" ")}…`;
  if (!text) throw new Error("Empty answer; try rephrasing.");
  const sources = new Map<string, string>();
  for (const b of blocks) for (const c of b.citations ?? []) if (c.type === "web_search_result_location" && c.url) sources.set(c.url, c.title ?? c.url);
  const answer = { text, sources: [...sources].slice(0, 5).map(([url, title]) => ({ url, title })) };
  if (cache.size > 200) cache.clear();
  cache.set(key, { at: Date.now(), answer });
  return answer;
}
