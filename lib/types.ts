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
  amountInIssue?: number | null; // £m nominal
}

export interface GiltSnapshot {
  asOf: string;
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
