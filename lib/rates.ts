// Rates tab data: daily US inflation breakevens, real yields and overnight / policy rates
// from FRED (public CSV, no key). UK breakevens and real yields come from the BoE curves.

export const RATE_SERIES = [
  { id: "US_BEI5", fred: "T5YIE", name: "US 5y breakeven" },
  { id: "US_BEI10", fred: "T10YIE", name: "US 10y breakeven" },
  { id: "US_5Y5Y", fred: "T5YIFR", name: "US 5y5y inflation expectation" },
  { id: "US_REAL5", fred: "DFII5", name: "US 5y real (TIPS)" },
  { id: "US_REAL10", fred: "DFII10", name: "US 10y real (TIPS)" },
  { id: "FED", fred: "DFEDTARU", name: "Fed funds target (upper)" },
  { id: "SOFR", fred: "SOFR", name: "SOFR" },
  { id: "ECB", fred: "ECBDFR", name: "ECB deposit rate" },
  { id: "ESTR", fred: "ECBESTRVOLWGTTRMDMNRT", name: "€STR" },
] as const;
export type RateId = (typeof RATE_SERIES)[number]["id"];

export interface RatesData {
  updatedAt: string;
  series: Partial<Record<RateId, [string, number][]>>;
  /** French government benchmark yields by tenor ("2", "5", "10", "30"), daily (Stooq). */
  france?: Record<string, [string, number][]>;
  franceKeys?: Record<string, string>;
}
