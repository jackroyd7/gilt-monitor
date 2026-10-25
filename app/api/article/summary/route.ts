import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getArticle, summarise, summariesEnabled } from "@/lib/article-fetch";
import { getNews } from "@/lib/news-fetch";

/** AI summary of one news item: POST /api/article/summary?id=<item id>. */
export async function POST(request: NextRequest) {
  if (!summariesEnabled()) return Response.json({ error: "Summaries are off: set ANTHROPIC_API_KEY." }, { status: 400 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const item = (await getNews()).items.find((i) => i.id === id);
  if (!item) return Response.json({ error: "Article not in the current feed." }, { status: 404 });
  const article = await getArticle(item);
  try {
    return Response.json({ summary: await summarise(item, article) });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "The Anthropic API key was rejected." }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "Rate limited by the Anthropic API; try again shortly." }, { status: 429 });
    if (e instanceof Anthropic.APIConnectionError) return Response.json({ error: "Couldn't reach the Anthropic API; try again." }, { status: 502 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: `Anthropic API error ${e.status}.` }, { status: 502 });
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
