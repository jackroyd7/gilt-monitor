// Shared data model. Everything on disk under data/ uses these shapes.
// Rates are always in percent (4.25 means 4.25%).

export type CurveId =
  | "uk_nominal"
  | "uk_real"
  | "uk_inflation"
  | "uk_ois"
  | "de_bund"
  | "us_ust";

/** How a curve's rates are quoted. Different bases differ by a few bp at the same tenor. */
export type RateBasis =
  | "zero_cc" // zero-coupon, continuously compounded (BoE fitted curves)
  | "zero_annual" // zero-coupon, annually compounded (Bundesbank Svensson)
  | "par_semiannual"; // par yield, semi-annual bond-equivalent (US Treasury)

/** A daily history of one curve: rows[date][i] is the rate at tenors[i] years. */
export interface CurveSet {
  id: CurveId;
  label: string;
  source: string;
  basis: RateBasis;
  tenors: number[];
  rows: Record<string, (number | null)[]>;
}

export type GiltType = "conventional" | "index-linked" | "strip" | "other";

export interface Gilt {
  isin: string;
  name: string;
  type: GiltType;
  coupon: number | null; // percent per annum
  maturity: string; // ISO date
  cleanPrice: number | null;
  dirtyPrice: number | null;
  /** Gross redemption yield in percent (real yield for index-linked). */
  yield: number | null;
  /** True when we computed the yield ourselves from the clean price. */
  yieldComputed?: boolean;
  /** Price is intraday from giltsyield.com rather than the DMO close. */
  live?: boolean;
  /** Indexation lag in months for index-linked gilts (3 for all issued since 2005). */
  indexLag?: 3 | 8;
  /** giltsyield.com ticker, used for price history calls. */
  ticker?: string;
  amountInIssue?: number | null; // £m nominal
  /** Close-of-business date the price refers to, when the source states it. */
  priceDate?: string;
}

export interface GiltSnapshot {
  asOf: string;
  /** Close-of-business date of the prices, when the source states it. */
  priceDate?: string;
  source: string;
  gilts: Gilt[];
}

export interface SourceStatus {
  ok: boolean;
  checkedAt: string;
  latestDate?: string;
  message?: string;
}

export interface DataStatus {
  updatedAt: string;
  demo?: boolean;
  sources: Record<string, SourceStatus>;
}

/** Intraday prices for every gilt from giltsyield.com. */
export interface LiveSnapshot {
  fetchedAt: string; // ISO, when we called the API
  priceTime?: string; // latest timestamp reported by giltsyield, if any
  gilts: Gilt[];
  failed: number;
  error?: string;
}

/** Daily close per gilt: rows[date][isin] = [clean price, yield %]. Linker yields are real. */
export interface GiltHistory {
  gilts: Record<string, { name: string; maturity: string; type: GiltType; ticker?: string }>;
  rows: Record<string, Record<string, [number | null, number | null]>>;
}
