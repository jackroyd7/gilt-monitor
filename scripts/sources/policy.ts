import { parseIadbCsv } from "../../lib/fx";
import { parseMpcDates } from "../../lib/parsers";
import type { PolicyData } from "../../lib/policy";
import { getText } from "./http";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** MPC dates (BoE website), Bank Rate and SONIA (BoE database). Keeps old dates if the page can't be read. */
export async function fetchPolicy(previous: PolicyData | undefined, since: string): Promise<{ data: PolicyData; notes: string[] }> {
  const notes: string[] = [];
  let mpcDates = previous?.mpcDates ?? [];
  try {
    const html = await getText(process.env.BOE_MPC_URL ?? "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates", "text/html");
    const found = parseMpcDates(html);
    console.log(`  MPC dates found: ${found.join(", ") || "none"}`);
    // Keep past dates already known (the page lists only upcoming ones).
    if (found.length) mpcDates = [...new Set([...mpcDates, ...found])].sort();
    else notes.push("no MPC dates found on the BoE page");
  } catch (e) {
    notes.push(`MPC dates: ${(e as Error).message}`);
  }
  const from = `${since.slice(8, 10)}/${MON[Number(since.slice(5, 7)) - 1]}/${since.slice(0, 4)}`;
  const url = `https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${from}&Dateto=now&SeriesCodes=IUDBEDR,IUDSOIA&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  const rows = parseIadbCsv(await getText(url, "text/csv"), ["IUDBEDR", "IUDSOIA"]);
  const dates = Object.keys(rows).sort();
  const pick = (i: number) => dates.flatMap((d) => (rows[d][i] == null ? [] : [[d, rows[d][i]!] as [string, number]]));
  const bankRate = pick(0);
  const sonia = pick(1);
  console.log(`  Bank Rate ${bankRate.at(-1)?.join(" ")}, SONIA ${sonia.at(-1)?.join(" ")}`);
  if (!bankRate.length) throw new Error("no Bank Rate data");
  return { data: { updatedAt: new Date().toISOString(), mpcDates, bankRate, sonia }, notes };
}
