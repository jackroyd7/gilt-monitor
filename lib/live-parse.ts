// Pure helpers for the giltsyield.com API responses (no network, safe to unit-test).
// Field names aren't documented, so columns are matched loosely by name.

import { parseCoupon } from "./bond";
import { indexLag, parseDate } from "./parsers";
import type { Gilt, GiltSnapshot, GiltType, LiveSnapshot } from "./types";

export type Row = Record<string, unknown>;

/** Finds the column whose name matches, case-insensitively. */
export function findKey(rows: Row[], ...patterns: RegExp[]): string | undefined {
  const keys = Object.keys(rows[0] ?? {});
  for (const p of patterns) {
    const k = keys.find((key) => p.test(key));
    if (k) return k;
  }
  return undefined;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[£,%\s]/g, ""));
  return isFinite(n) ? n : null;
};

function field(row: Row, ...patterns: RegExp[]): unknown {
  const k = findKey([row], ...patterns);
  return k ? row[k] : undefined;
}

/** One row of /api/bonds/ -> static gilt data, matching column names loosely. */
export function parseBondRow(r: Row) {
  const ticker = field(r, /^ticker$/i, /ticker/i, /^symbol$/i, /^tidm$/i, /^epic$/i, /^code$/i);
  const isin = field(r, /^isin$/i, /isin/i);
  const name = String(field(r, /^name$/i, /description/i, /^title$/i, /bond_?name/i) ?? "");
  const typeRaw = String(field(r, /^type$/i, /bond_?type/i, /instrument_?type/i, /linked/i) ?? "");
  const mat = parseDate(field(r, /^maturity$/i, /maturity/i, /redemption/i));
  const coupon = num(field(r, /^coupon$/i, /coupon/i)) ?? (name ? parseCoupon(name) : null);
  const t = `${typeRaw} ${name}`.toLowerCase();
  const type: GiltType = /index|linker|\bil\b|true/.test(t) ? "index-linked" : "conventional";
  const isinStr = isin == null ? "" : String(isin).trim();
  const lagText = `${String(field(r, /lag/i) ?? "")} ${typeRaw}`;
  return {
    ticker: ticker == null ? "" : String(ticker),
    isin: isinStr,
    name: name || String(ticker ?? isin ?? ""),
    type,
    coupon,
    maturity: mat ?? "",
    indexLag: type === "index-linked" ? indexLag(lagText, isinStr, coupon, mat ?? undefined) : undefined,
  };
}

/** One /api/bond/price/<ticker>/ response -> prices, yield and timestamp. */
export function parsePriceRow(r: Row) {
  const time = field(r, /timestamp/i, /updated/i, /^time$/i, /datetime/i, /as_?of/i, /^date$/i);
  return {
    clean: num(field(r, /^clean$/i, /clean_?price/i, /clean/i)),
    dirty: num(field(r, /^dirty$/i, /dirty_?price/i, /dirty/i)),
    ytm: num(field(r, /yield_?to_?maturity/i, /^ytm$/i, /^gry$/i, /redemption_?yield/i, /^yield$/i)),
    time: time == null ? undefined : String(time),
  };
}

/**
 * Yields may come as decimals (0.045) rather than percent (4.5). Conventional gilt
 * yields are never below 0.25%, so a median that low means decimals.
 */
export function normaliseYieldUnits(gilts: Gilt[]) {
  const conv = gilts.filter((g) => g.type === "conventional" && g.yield != null).map((g) => g.yield as number).sort((a, b) => a - b);
  if (conv.length && conv[Math.floor(conv.length / 2)] < 0.25) {
    for (const g of gilts) if (g.yield != null) g.yield *= 100;
  }
}

/**
 * Overlays live prices onto the DMO close-of-business snapshot by ISIN. Gilts only
 * giltsyield knows about are added; gilts without a live price keep the DMO close.
 */
export function withLive(dmo: GiltSnapshot | undefined, live: LiveSnapshot | null): GiltSnapshot | undefined {
  if (!live?.gilts.length) return dmo;
  const byIsin = new Map(live.gilts.map((g) => [g.isin, g]));
  const merged: Gilt[] = (dmo?.gilts ?? []).map((g) => {
    const l = byIsin.get(g.isin);
    byIsin.delete(g.isin);
    if (!l || (l.yield == null && l.cleanPrice == null)) return g;
    return {
      ...g,
      cleanPrice: l.cleanPrice ?? g.cleanPrice,
      dirtyPrice: l.dirtyPrice ?? g.dirtyPrice,
      yield: l.yield ?? g.yield,
      yieldComputed: l.yield != null ? l.yieldComputed : g.yieldComputed,
      live: true,
    };
  });
  for (const l of byIsin.values()) if (l.maturity) merged.push(l);
  merged.sort((a, b) => a.maturity.localeCompare(b.maturity));
  return {
    asOf: live.fetchedAt.slice(0, 10),
    source: dmo ? "giltsyield.com live, DMO close where missing" : "giltsyield.com live",
    gilts: merged,
  };
}
