"use server";

import { refresh } from "next/cache";
import { getLive } from "@/lib/live";

/** Re-fetches giltsyield.com prices now, bypassing the cache, and re-renders the page. */
export async function refreshLive() {
  await getLive({ force: true });
  refresh();
}
