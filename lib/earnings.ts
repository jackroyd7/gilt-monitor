// Earnings calendar helpers (Finnhub). Pure functions, shared by the server fetcher and tests.

export interface EarningsEvent {
  date: string;
  /** TradingView symbol from our stock list, e.g. "LSE:SHEL". */
  symbol: string;
  name: string;
  region: "US" | "UK" | "Europe" | "Asia";
  /** "bmo" before open, "amc" after close, "dmh" during hours, or "". */
  hour: string;
  quarter: number | null;
  year: number | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}

const SUFFIX: Record<string, string> = {
  LSE: ".L",
  XETR: ".DE",
  EURONEXT: ".PA",
  TSE: ".T",
  KRX: ".KS",
  TWSE: ".TW",
  SZSE: ".SZ",
  HKEX: ".HK",
};

/** Finnhub's symbol for a TradingView symbol: "LSE:BP." → "BP.L", "HKEX:700" → "0700.HK". */
export function finnhubSymbol(
  tv: string,
  usListings: Record<string, string> = {},
): string | null {
  if (usListings[tv]) return usListings[tv];
  const [ex, raw] = tv.split(":");
  if (!raw) return null;
  if (ex === "NASDAQ" || ex === "NYSE" || ex === "AMEX" || ex === "US")
    return raw;
  if (ex === "YF") return raw;
  const suffix = SUFFIX[ex];
  if (!suffix) return null;
  const t = raw.replace(/\.$/, "").replace(/\./g, "-");
  return (ex === "HKEX" ? t.padStart(4, "0") : t) + suffix;
}

export function regionOf(group: string): EarningsEvent["region"] {
  if (group.startsWith("US")) return "US";
  if (group.startsWith("UK")) return "UK";
  if (group.startsWith("Asian")) return "Asia";
  return "Europe";
}

const n = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Keeps the calendar rows for stocks on our list and maps them to our symbols. */
export function matchEarnings(
  rows: Record<string, unknown>[],
  stocks: { symbol: string; name: string; group: string }[],
  usListings: Record<string, string> = {},
): EarningsEvent[] {
  const bySymbol = new Map<string, (typeof stocks)[number]>();
  for (const s of stocks) {
    const f = finnhubSymbol(s.symbol, usListings);
    if (f) bySymbol.set(f.toUpperCase(), s);
  }
  const seen = new Set<string>();
  const out: EarningsEvent[] = [];
  for (const r of rows) {
    const s = bySymbol.get(String(r.symbol ?? "").toUpperCase());
    const date = String(r.date ?? "");
    if (
      !s ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      seen.has(`${s.symbol}|${date}`)
    )
      continue;
    seen.add(`${s.symbol}|${date}`);
    out.push({
      date,
      symbol: s.symbol,
      name: s.name,
      region: regionOf(s.group),
      hour: typeof r.hour === "string" ? r.hour : "",
      quarter: n(r.quarter),
      year: n(r.year),
      epsEstimate: n(r.epsEstimate),
      epsActual: n(r.epsActual),
      revenueEstimate: n(r.revenueEstimate),
      revenueActual: n(r.revenueActual),
    });
  }
  return out.sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
  );
}
