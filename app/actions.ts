"use server";

import { refresh } from "next/cache";
import { getLive } from "@/lib/live";

/** Re-fetches giltsyield.com prices now, bypassing the cache, and re-renders the page. */
export async function refreshLive() {
  await getLive({ force: true });
  refresh();
}

/** Re-fetches all news feeds now and re-renders the page. */
export async function refreshNews() {
  const { getNews } = await import("@/lib/news-fetch");
  await getNews({ force: true });
  refresh();
}
