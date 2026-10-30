import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { anthropicKey } from "./briefing-gen";
import { searchListings, type SearchHit } from "./symbol-resolve";
import type { Call, Horizon, Risk, Verdict } from "./tips";

// The two AI steps of the tips portfolio: reading screenshots of a week's tips, and
// judging which are worth holding. Both return JSON constrained by a schema.

const MODEL = "claude-opus-5-5";

const client = () => {
  const apiKey = anthropicKey();
  if (!apiKey)
    throw new Error("Set ANTHROPIC_API_KEY in Vercel to use the tips reader.");
  return new Anthropic({ apiKey });
};

const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });

async function jsonCall<T>(
  system: string,
  content: Anthropic.Beta.BetaContentBlockParam[],
  schema: Record<string, unknown>,
  effort: "low" | "medium" | "high",
): Promise<T> {
  const response = await client().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort, format: { type: "json_schema", schema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal")
    throw new Error("The model declined this request.");
  if (response.stop_reason === "max_tokens")
    throw new Error(
      "The reply was cut short; try fewer screenshots at a time.",
    );
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Couldn't read the model's reply; please try again.");
  }
}

// ---------------------------------------------------------------- reading screenshots

export interface ExtractedTip {
  company: string;
  ticker: string | null;
  exchange: string | null;
  country: string | null;
  call: Call;
  source: string | null;
  priceAtTip: number | null;
  currency: string | null;
  target: number | null;
  rationale: string;
}

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["issueDate", "tips"],
  properties: {
    issueDate: nullable("string"),
    tips: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "company",
          "ticker",
          "exchange",
          "country",
          "call",
          "source",
          "priceAtTip",
          "currency",
          "target",
          "rationale",
        ],
        properties: {
          company: { type: "string" },
          ticker: nullable("string"),
          exchange: nullable("string"),
          country: nullable("string"),
          call: { type: "string", enum: ["buy", "hold", "sell"] },
          source: nullable("string"),
          priceAtTip: nullable("number"),
          currency: nullable("string"),
          target: nullable("number"),
          rationale: { type: "string" },
        },
      },
    },
  },
};

const EXTRACT_SYSTEM = `You read screenshots of a magazine's weekly share-tips column (usually The Week's "Shares" page, which collects tips from other publications) and list every individual stock tip.
For each tip give: the company name as printed; the ticker and exchange if shown (else null); the company's country if clear (else null); the call (buy, hold or sell - "take profits" counts as sell); the publication or tipster it is credited to; the share price quoted when tipped and its currency (use "GBp" for prices in pence such as "245p", "GBP" for pounds, otherwise the ISO code); any price target quoted; and the tipster's case in one or two sentences of your own words (at most 40 words; don't copy the article).
issueDate is the magazine's issue date as YYYY-MM-DD if visible, else null. Skip funds, trusts and bonds only if they are clearly not shares listed on an exchange; keep investment trusts. If the same tip appears twice across screenshots, list it once.`;

export interface ResolvedTip extends ExtractedTip {
  symbol: string | null;
  matchName: string | null;
  alternatives: SearchHit[];
}

const UK = /london|lse|aim|\buk\b|united kingdom|britain|england|scotland/i;
const US = /nasdaq|nyse|new york|\bus\b|usa|united states|america/i;

/** Picks the listing that best matches the tip: its ticker and market, else the company name. */
async function resolve(t: ExtractedTip): Promise<ResolvedTip> {
  const hint = `${t.exchange ?? ""} ${t.country ?? ""}`;
  const wantsUk = UK.test(hint) || t.currency === "GBp" || t.currency === "GBP";
  const wantsUs = !wantsUk && (US.test(hint) || t.currency === "USD");
  const fits = (h: SearchHit) =>
    wantsUk
      ? h.symbol.startsWith("LSE:") || /\.L$/.test(h.ticker)
      : wantsUs
        ? /^(NASDAQ|NYSE|AMEX|US):/.test(h.symbol)
        : true;
  const byName = await searchListings(
    t.company.replace(/\b(plc|inc|ltd|group|holdings)\b\.?/gi, "").trim() ||
      t.company,
  );
  const byTicker = t.ticker ? await searchListings(t.ticker) : [];
  const pool = [...byTicker, ...byName].filter(
    (h, i, all) =>
      all.findIndex((x) => x.symbol === h.symbol) === i && !h.type,
  );
  const tickerMatch = t.ticker
    ? pool.find(
        (h) =>
          fits(h) &&
          h.ticker.split(".")[0].toUpperCase() ===
            t.ticker!.toUpperCase().replace(/\.$/, ""),
      )
    : undefined;
  const pick =
    tickerMatch ??
    byName.find(fits) ??
    pool.find(fits) ??
    (wantsUk || wantsUs ? undefined : pool[0]);
  return {
    ...t,
    symbol: pick?.symbol ?? null,
    matchName: pick?.name ?? null,
    alternatives: pool.slice(0, 6),
  };
}

/** Reads the tips from screenshots (base64 JPEG/PNG) and finds each one's listing. */
export async function extractTips(
  images: {
    data: string;
    mediaType: "image/jpeg" | "image/png" | "image/webp";
  }[],
): Promise<{ issueDate: string | null; tips: ResolvedTip[] }> {
  const out = await jsonCall<{
    issueDate: string | null;
    tips: ExtractedTip[];
  }>(
    EXTRACT_SYSTEM,
    [
      ...images.map((img) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: img.mediaType,
          data: img.data,
        },
      })),
      {
        type: "text",
        text: `List the stock tips in ${images.length > 1 ? "these screenshots" : "this screenshot"}.`,
      },
    ],
    EXTRACT_SCHEMA,
    "medium",
  );
  const issueDate =
    out.issueDate && /^\d{4}-\d{2}-\d{2}$/.test(out.issueDate)
      ? out.issueDate
      : null;
  const tips = await Promise.all(out.tips.slice(0, 30).map(resolve));
  return { issueDate, tips };
}

// ---------------------------------------------------------------- judging the tips

/** What the reviewer sees about each stock: the tip, our market data and the fundamentals we could find. */
export interface ReviewInput {
  symbol: string;
  name: string;
  held: boolean;
  facts: string;
}

export interface Review {
  symbol: string;
  verdict: Verdict;
  conviction: number;
  target: number | null;
  targetBasis: string;
  summary: string;
  risks: string;
}

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overview", "reviews"],
  properties: {
    overview: { type: "string" },
    reviews: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "symbol",
          "verdict",
          "conviction",
          "target",
          "targetBasis",
          "summary",
          "risks",
        ],
        properties: {
          symbol: { type: "string" },
          verdict: { type: "string", enum: ["include", "maybe", "skip"] },
          conviction: { type: "integer", enum: [1, 2, 3, 4, 5] },
          target: nullable("number"),
          targetBasis: { type: "string" },
          summary: { type: "string" },
          risks: { type: "string" },
        },
      },
    },
  },
};

const RISK_TEXT: Record<Risk, string> = {
  cautious:
    "cautious: prefers established, profitable, liquid companies; avoids speculative small caps and very volatile shares",
  balanced:
    "balanced: a mix of quality and value, with a little room for higher-risk ideas",
  adventurous:
    "adventurous: comfortable with smaller, more volatile companies where the upside justifies it",
};
const HORIZON_TEXT: Record<Horizon, string> = {
  "6m": "6 months",
  "1y": "1 year",
  "3y": "3 years",
};

const REVIEW_SYSTEM = `You help a UK-based private investor choose which published stock tips to put into a diversified share portfolio. For each stock you get the tip, our latest market data and whatever fundamentals we could find.
For every stock return:
- verdict: "include" (worth holding now), "maybe" (reasonable but not compelling, or needs a better price) or "skip". A sell tip on a stock already held should normally be "skip"; a sell tip on a stock not held is "skip".
- conviction 1-5 (5 = strongest), reflecting the quality of the case, valuation, momentum since the tip and fit with the investor's risk appetite.
- target: a price target for the investor's horizon in the stock's quoted currency and units (pence for London listings), or null if there's no sound basis. Base it on the analyst consensus target if given, valuation versus the stock's own history and peers, the tipster's target, and expected earnings growth; keep it realistic for the horizon. Say the basis in targetBasis (one short sentence).
- summary: why, in at most 35 words, plain British English. risks: the main risk in at most 20 words.
Judge each on its merits but think about the portfolio: prefer a spread of sectors and countries, avoid piling into one theme, flag tiny or illiquid companies, and be wary of shares that have already run up a lot since the tip. Not every tip should be included - be selective. Use only the data supplied; if something important is missing, say so in the summary rather than guessing.
overview: two or three sentences on this week's tips as a set and how they fit the existing holdings.`;

export async function reviewTips(
  stocks: ReviewInput[],
  settings: { risk: Risk; horizon: Horizon },
  holdingsNote: string,
): Promise<{ overview: string; reviews: Review[] }> {
  const text = [
    `Investor: risk appetite ${RISK_TEXT[settings.risk]}; horizon ${HORIZON_TEXT[settings.horizon]}.`,
    `Current portfolio: ${holdingsNote}`,
    "",
    ...stocks.map(
      (s) =>
        `### ${s.symbol} - ${s.name}${s.held ? " (already held)" : ""}\n${s.facts}`,
    ),
  ].join("\n");
  const out = await jsonCall<{ overview: string; reviews: Review[] }>(
    REVIEW_SYSTEM,
    [{ type: "text", text }],
    REVIEW_SCHEMA,
    "medium",
  );
  const known = new Set(stocks.map((s) => s.symbol));
  return {
    overview: out.overview,
    reviews: out.reviews.filter((r) => known.has(r.symbol)),
  };
}
