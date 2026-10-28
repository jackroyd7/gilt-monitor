// Pure parsers for each upstream format, kept free of network code so they can be tested.
// Upstream layouts change from time to time, so each parser locates things by pattern
// (a header row of maturities, a column name that looks like "yield") rather than by
// fixed cell positions.

import * as XLSX from "xlsx";
import { XMLParser } from "fast-xml-parser";
import { parseCoupon } from "./bond";
import type { CurveSet, Gilt, GiltType } from "./types";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Accepts ISO, "22-Jan-2027", "22 Jan 2027", "22/01/2027" (UK), "01/22/2027" (when `us`), Excel serials, Date. */
export function parseDate(v: unknown, opts: { us?: boolean } = {}): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null; // Excel serial day range ~1954-2119
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{2,4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(Number(m[1]))}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    const [day, month] = opts.us ? [b, a] : [a, b];
    return `${m[3]}-${pad(month)}-${pad(day)}`;
  }
  return null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return isFinite(n) ? n : null;
};

// ---------------------------------------------------------------- CSV

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

export function csvToRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ""));
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

// ---------------------------------------------------------------- Bank of England

export type BoeCurveKind = "nominal" | "real" | "inflation" | "ois";

/** Which curve a file in the BoE zip holds, from its file name. */
export function boeKindFromFilename(name: string): BoeCurveKind | null {
  const n = name.toLowerCase();
  if (!n.endsWith(".xlsx") && !n.endsWith(".xls")) return null;
  if (n.includes("ois")) return "ois";
  if (n.includes("nominal")) return "nominal";
  if (n.includes("real")) return "real";
  if (n.includes("inflation")) return "inflation";
  return null;
}

/**
 * Reads the long-end spot (zero-coupon) curve sheet of a BoE yield curve workbook.
 * Sheet names look like "4. spot curve"; the short-end variant ("3. spot, short end")
 * uses monthly tenors and is skipped.
 */
export function parseBoeWorkbook(buf: Uint8Array, sheet: "spot" | "fwdShort" = "spot"): { tenors: number[]; rows: CurveSet["rows"] } | null {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  // "fwdShort" is the monthly short-end forward sheet ("1. fwds, short end"); its tenors are
  // months and are returned in years.
  const sheetName =
    sheet === "fwdShort"
      ? wb.SheetNames.find((s) => /fwd|forward/i.test(s) && /short/i.test(s))
      : (wb.SheetNames.find((s) => /spot curve/i.test(s) && !/short/i.test(s)) ?? wb.SheetNames.find((s) => /spot/i.test(s) && !/short/i.test(s)));
  if (!sheetName) return null;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });

  let headerIdx = -1;
  let cols: { col: number; t: number }[] = [];
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const cand: { col: number; t: number }[] = [];
    grid[r].forEach((v, c) => {
      if (c > 0 && typeof v === "number" && v > 0 && v <= 60) cand.push({ col: c, t: v });
    });
    const increasing = cand.every((x, i) => i === 0 || x.t > cand[i - 1].t);
    if (cand.length >= 5 && increasing) {
      headerIdx = r;
      cols = cand;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const rows: CurveSet["rows"] = {};
  for (const line of grid.slice(headerIdx + 1)) {
    const date = parseDate(line[0]);
    if (!date) continue;
    const vals = cols.map(({ col }) => num(line[col]));
    if (vals.some((v) => v != null)) rows[date] = vals;
  }
  return { tenors: cols.map((c) => (sheet === "fwdShort" ? +(c.t / 12).toFixed(4) : c.t)), rows };
}

// ---------------------------------------------------------------- MPC dates

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * MPC announcement dates from the BoE "upcoming MPC dates" page: dates like "Thursday 5
 * February" listed under year headings, or written in full with the year.
 */
export function parseMpcDates(html: string): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    // End every block element with a separator so a year heading never reads as the year
    // of the date before it.
    .replace(/<\/(?:li|p|h\d|td|th|tr|div|dd|dt)>|<br\s*\/?>/gi, " ; ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");
  const out = new Set<string>();
  let year: number | null = null;
  const re = /\b(20\d{2})\b|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(20\d{2}))?/gi;
  for (const m of text.matchAll(re)) {
    if (m[1]) {
      year = Number(m[1]);
      continue;
    }
    const y = m[4] ? Number(m[4]) : year;
    if (!y) continue;
    const mo = MONTH_NAMES.indexOf(m[3].toLowerCase()) + 1;
    out.add(`${y}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`);
  }
  return [...out].sort();
}

// ---------------------------------------------------------------- US Treasury

export function ustTenor(label: string): number | null {
  const m = label.match(/(\d+(?:\.\d+)?)\s*(Mo|Month|Yr|Year)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return /^mo/i.test(m[2]) ? n / 12 : n;
}

/** Daily Treasury Par Yield Curve Rates CSV: Date,"1 Mo","2 Mo",...,"30 Yr". */
export function parseUstCsv(text: string): { tenors: number[]; rows: CurveSet["rows"] } {
  const [header, ...lines] = parseCsv(text.replace(/^﻿/, ""));
  const cols = header
    .map((h, i) => ({ i, t: ustTenor(h) }))
    .filter((c): c is { i: number; t: number } => c.t != null)
    .sort((a, b) => a.t - b.t);
  const rows: CurveSet["rows"] = {};
  for (const l of lines) {
    const date = parseDate(l[0], { us: true });
    if (date) rows[date] = cols.map((c) => num(l[c.i]));
  }
  return { tenors: cols.map((c) => c.t), rows };
}

// ---------------------------------------------------------------- Bundesbank

/**
 * SDMX-CSV from the Bundesbank API for BBSIS Svensson zero yields. The residual-maturity
 * dimension appears as a code like "R10XX" (10 years); we find it in whichever column
 * holds it, so column naming differences don't matter.
 */
export function parseBundesbankSdmxCsv(text: string): { tenors: number[]; rows: CurveSet["rows"] } {
  const recs = csvToRecords(text.replace(/;/g, ","));
  const byDate: Record<string, Record<number, number>> = {};
  const tenorSet = new Set<number>();
  for (const r of recs) {
    const date = parseDate(r.TIME_PERIOD ?? r.TIME ?? r.date);
    const value = num(r.OBS_VALUE ?? r.value);
    let tenor: number | null = null;
    for (const v of Object.values(r)) {
      const m = String(v).match(/(?:^|\.)R(\d{2})XX(?:\.|$)/);
      if (m) { tenor = Number(m[1]); break; }
    }
    if (!date || value == null || tenor == null) continue;
    tenorSet.add(tenor);
    (byDate[date] ??= {})[tenor] = value;
  }
  const tenors = [...tenorSet].sort((a, b) => a - b);
  const rows: CurveSet["rows"] = {};
  for (const [d, m] of Object.entries(byDate)) rows[d] = tenors.map((t) => m[t] ?? null);
  return { tenors, rows };
}

// ---------------------------------------------------------------- DMO

/** Flattens every XML element carrying attributes into a record (DMO reports put data in attributes). */
export function xmlToRecords(xml: string): Record<string, string>[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const out: Record<string, string>[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(node)) {
        if (v == null || typeof v !== "object") flat[k] = String(v ?? "");
        else walk(v);
      }
      if (Object.keys(flat).length >= 3) out.push(flat);
    }
  };
  walk(parser.parse(xml));
  return out;
}

const norm = (k: string) => k.toLowerCase().replace(/[^a-z]/g, "");

function pick(r: Record<string, string>, ...patterns: RegExp[]): string | undefined {
  const keys = Object.keys(r);
  for (const p of patterns) {
    const k = keys.find((key) => p.test(norm(key)));
    if (k && r[k] !== "") return r[k];
  }
  return undefined;
}

// The only 8-month-lag linkers still in issue: 4⅛% IL 2030 and 2% IL 2035.
const EIGHT_MONTH_LAG_ISINS = new Set(["GB0008932666", "GB0031790826"]);

/** Indexation lag of an index-linked gilt from its type text, ISIN, or coupon and maturity. */
export function indexLag(text: string, isin?: string, coupon?: number | null, maturity?: string): 3 | 8 {
  const t = text.toLowerCase();
  if (/\b8\s*-?\s*m(onth)?s?\b/.test(t)) return 8;
  if (/\b3\s*-?\s*m(onth)?s?\b/.test(t)) return 3;
  if (isin && EIGHT_MONTH_LAG_ISINS.has(isin)) return 8;
  const y = maturity?.slice(0, 4);
  if ((y === "2030" && coupon === 4.125) || (y === "2035" && coupon === 2)) return 8;
  return 3;
}

/** We only show 3-month-lag linkers; the two old 8-month ones price on a different basis. */
export const excludedGilt = (g: { type: GiltType; indexLag?: 3 | 8 }) => g.type === "index-linked" && g.indexLag === 8;

function giltType(typeField: string | undefined, name: string): GiltType {
  const s = `${typeField ?? ""} ${name}`.toLowerCase();
  if (s.includes("strip")) return "strip";
  if (s.includes("index")) return "index-linked";
  if (s.includes("conventional") || s.includes("treasury") || s.includes("gilt")) return "conventional";
  return "other";
}

/** Maps DMO-style records (gilts in issue, reference prices) to Gilt objects keyed by ISIN. */
export function recordsToGilts(records: Record<string, string>[]): Map<string, Partial<Gilt>> {
  const out = new Map<string, Partial<Gilt>>();
  for (const r of records) {
    const isin = pick(r, /^isin/, /isin/);
    if (!isin || !/^GB[0-9A-Z]{10}$/.test(isin.trim())) continue;
    const name = pick(r, /instrumentname/, /^name$/, /description/, /stock/) ?? "";
    const g: Partial<Gilt> = { isin: isin.trim() };
    if (name) g.name = name.trim();
    const typeField = pick(r, /instrumenttype/, /^type$/);
    if (name || typeField) g.type = giltType(typeField, name);
    const coupon = num(pick(r, /^coupon/)) ?? (name ? parseCoupon(name) : null);
    if (coupon != null) g.coupon = coupon;
    const mat = parseDate(pick(r, /redemptiondate/, /maturity/));
    if (mat) g.maturity = mat;
    const clean = num(pick(r, /cleanprice/, /^clean/, /^price$/));
    if (clean != null) g.cleanPrice = clean;
    const dirty = num(pick(r, /dirtyprice/, /^dirty/));
    if (dirty != null) g.dirtyPrice = dirty;
    const y = num(pick(r, /^yield$/, /grossredemptionyield/, /^gry/, /redemptionyield/, /yield/));
    if (y != null) g.yield = y;
    if (g.type === "index-linked") g.indexLag = indexLag(`${typeField ?? ""} ${name}`, g.isin, g.coupon, g.maturity);
    const pd = parseDate(pick(r, /closeofbusiness/, /cobdate/, /businessdate/, /pricedate/, /tradedate/, /^date$/));
    if (pd && (g.cleanPrice != null || g.yield != null)) g.priceDate = pd;
    const amt = num(pick(r, /amountinissue/, /nominalamount/, /outstanding/));
    if (amt != null) g.amountInIssue = amt;
    out.set(g.isin!, { ...out.get(g.isin!), ...g });
  }
  return out;
}

export function parseDmoText(text: string): Map<string, Partial<Gilt>> {
  const t = text.trim();
  return recordsToGilts(t.startsWith("<") ? xmlToRecords(t) : csvToRecords(t));
}
