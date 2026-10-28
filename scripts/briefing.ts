// Writes the morning briefing to data/briefing.json (GitHub Action "Morning briefing").
// Optional: the site also writes briefings itself on Vercel (cron + Overview button).
// Without an ANTHROPIC_API_KEY repository secret this exits quietly.
//
//   npm run briefing             # only between 06:00 and 08:59 London time on weekdays
//   npm run briefing -- --force  # any time

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { londonClock, type Briefing } from "../lib/briefing";
import { anthropicKey, generateBriefing } from "../lib/briefing-gen";

const DATA = path.resolve(process.env.DATA_DIR ?? "data");

async function main() {
  if (!anthropicKey()) {
    console.log("No ANTHROPIC_API_KEY secret: skipping (the site writes briefings on Vercel instead).");
    return;
  }
  const now = londonClock();
  const force = process.argv.includes("--force");
  if (!force && (now.weekday === 0 || now.weekday === 6 || now.hour < 6 || now.hour > 8)) {
    console.log(`Not briefing time in London (${now.date} ${now.hour}:00); skipping. Use --force to run anyway.`);
    return;
  }
  let existing: Briefing | undefined;
  try {
    existing = JSON.parse(await readFile(path.join(DATA, "briefing.json"), "utf8"));
  } catch {}
  if (!force && existing?.date === now.date) {
    console.log(`Briefing for ${now.date} already written; skipping.`);
    return;
  }
  const briefing = await generateBriefing(DATA);
  await writeFile(path.join(DATA, "briefing.json"), JSON.stringify(briefing, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
