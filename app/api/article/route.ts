import type { NextRequest } from "next/server";
import { getArticle, summariesEnabled } from "@/lib/article-fetch";
import { findNewsItem } from "@/lib/news-fetch";

/** Reader view of one news item: /api/article?id=<item id from the News feed>. */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const item = await findNewsItem(id);
  if (!item) return Response.json({ error: "Article not in the current feed; refresh the News page." }, { status: 404 });
  const article = await getArticle(item);
  return Response.json({ ...article, summaries: summariesEnabled() });
}
