import { giltYieldFromClean } from "../../lib/bond";
import { excludedGilt, parseDmoText } from "../../lib/parsers";
import type { Gilt, GiltSnapshot } from "../../lib/types";
import { getText } from "./http";

const BASE = "https://www.dmo.gov.uk/data";
// D1A = gilts in issue (static data), D10B = gilt reference prices (close of business).
const IN_ISSUE_URLS = [process.env.DMO_IN_ISSUE_URL, `${BASE}/XmlDataReport?reportCode=D1A`].filter(Boolean) as string[];
const PRICE_URLS = [process.env.DMO_PRICES_URL, `${BASE}/XmlDataReport?reportCode=D10B`].filter(Boolean) as string[];

async function firstWorking(urls: string[], want: (m: Map<string, Partial<Gilt>>) => boolean) {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const m = parseDmoText(await getText(url));
      if (want(m)) return m;
      errors.push(`${url}: no usable rows`);
    } catch (e) {
      errors.push(`${url}: ${(e as Error).message}`);
    }
  }
  throw new Error(errors.join("; "));
}

export async function fetchDmo(): Promise<{ snapshot: GiltSnapshot; warning?: string }> {
  const staticData = await firstWorking(IN_ISSUE_URLS, (m) => m.size > 10);
  let prices = new Map<string, Partial<Gilt>>();
  let warning: string | undefined;
  try {
    prices = await firstWorking(PRICE_URLS, (m) => [...m.values()].some((g) => g.cleanPrice != null));
  } catch (e) {
    warning = `prices unavailable: ${(e as Error).message}`;
  }

  const asOf = new Date().toISOString().slice(0, 10);
  const gilts: Gilt[] = [];
  for (const [isin, s] of staticData) {
    const p = prices.get(isin) ?? {};
    const g: Gilt = {
      isin,
      name: s.name ?? p.name ?? isin,
      type: s.type ?? p.type ?? "other",
      coupon: s.coupon ?? p.coupon ?? null,
      maturity: s.maturity ?? p.maturity ?? "",
      cleanPrice: p.cleanPrice ?? null,
      dirtyPrice: p.dirtyPrice ?? null,
      yield: p.yield ?? null,
      amountInIssue: s.amountInIssue ?? null,
      indexLag: s.indexLag ?? p.indexLag,
      priceDate: p.priceDate,
    };
    if (excludedGilt(g)) continue;
    if (!g.maturity || g.maturity <= asOf || g.type === "strip") continue;
    if (g.yield == null && g.cleanPrice != null && g.coupon != null && g.type === "conventional") {
      const calc = giltYieldFromClean(g.cleanPrice, g.coupon, g.maturity, asOf);
      if (calc) {
        g.yield = calc.yield;
        g.dirtyPrice ??= calc.dirty;
        g.yieldComputed = true;
      }
    }
    gilts.push(g);
  }
  gilts.sort((a, b) => a.maturity.localeCompare(b.maturity));
  const priceDate = gilts.map((g) => g.priceDate).filter(Boolean).sort().pop();
  return { snapshot: { asOf, priceDate, source: "UK Debt Management Office", gilts }, warning };
}
