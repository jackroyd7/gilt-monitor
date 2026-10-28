import "server-only";
import type { Briefing } from "./briefing";
import { loadBriefing } from "./data";
import { getPref, prefsConfigured, setPref } from "./prefs-store";

// Briefings written on the site are kept in the preference store (Upstash Redis, shared by
// all server instances) when it is connected, and in memory otherwise. The newest of those
// and data/briefing.json (written by the GitHub job, if it has a key) is shown.

const mem = ((globalThis as { __giltBriefing?: { latest: Briefing | null; running: Promise<Briefing> | null } }).__giltBriefing ??= {
  latest: null,
  running: null,
});

export async function latestBriefing(): Promise<Briefing | undefined> {
  const candidates: (Briefing | null | undefined)[] = [await loadBriefing(), mem.latest];
  if (prefsConfigured()) {
    try {
      candidates.push(await getPref<Briefing>("briefing"));
    } catch {}
  }
  return candidates.filter((b): b is Briefing => !!b?.markdown).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
}

export async function saveBriefing(b: Briefing) {
  mem.latest = b;
  if (prefsConfigured()) {
    try {
      await setPref("briefing", b);
    } catch (e) {
      console.warn(`briefing not saved to preference store: ${(e as Error).message}`);
    }
  }
}

/** Runs one generation at a time per server instance; concurrent callers share it. */
export function runOnce(job: () => Promise<Briefing>): Promise<Briefing> {
  mem.running ??= job()
    .then(async (b) => {
      await saveBriefing(b);
      return b;
    })
    .finally(() => {
      mem.running = null;
    });
  return mem.running;
}
