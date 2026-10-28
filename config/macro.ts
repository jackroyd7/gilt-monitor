// Economics tab: which series to show. Each indicator row has one series per economy.
// Sources (all free, no key): ONS (UK), FRED's public CSV downloads (US and OECD/Eurostat
// series for other economies), the ECB data portal, the BoE database (Bank Rate) and the
// IMF World Economic Outlook.

export const ECONOMIES = [
  { id: "UK", name: "UK" },
  { id: "US", name: "US" },
  { id: "EA", name: "Euro area" },
  { id: "DE", name: "Germany" },
  { id: "FR", name: "France" },
  { id: "JP", name: "Japan" },
] as const;
export type EconomyId = (typeof ECONOMIES)[number]["id"];

/** How a downloaded series becomes the number shown. */
export type Transform =
  | "level" // as published
  | "yoy" // % change on a year earlier (from an index or level)
  | "pop" // % change on the previous period
  | "diff"; // change on the previous period (e.g. payrolls, thousands)

export interface SeriesSpec {
  source: "ons" | "fred" | "boe" | "ecb";
  /** ONS: "path/cdid/dataset"; FRED: series id; BoE: series code; ECB: "FLOW/KEY". */
  id: string;
  transform: Transform;
  note?: string;
  /** Multiply published values by this (e.g. -0.001 turns ONS £m net lending into £bn borrowing). */
  scale?: number;
}

export interface Indicator {
  id: string;
  label: string;
  group: "Growth" | "Inflation" | "Labour market" | "Rates" | "Public finances";
  unit: "%" | "k" | "£bn";
  series: Partial<Record<EconomyId, SeriesSpec>>;
}

const ons = (path: string, cdid: string, dataset: string, transform: Transform = "level", note?: string): SeriesSpec => ({
  source: "ons",
  id: `${path}/${cdid}/${dataset}`,
  transform,
  note,
});
const ecb = (id: string, note?: string): SeriesSpec => ({ source: "ecb", id, transform: "level", note });
const fred = (id: string, transform: Transform = "level", note?: string): SeriesSpec => ({ source: "fred", id, transform, note });

const INFL = "economy/inflationandpriceindices";
const GDP = "economy/grossdomesticproductgdp";
const LAB = "employmentandlabourmarket";
const PSF = "economy/governmentpublicsectorandtaxes/publicsectorfinance";

export const INDICATORS: Indicator[] = [
  {
    id: "gdp_qoq",
    label: "Real GDP, % q/q",
    group: "Growth",
    unit: "%",
    series: {
      UK: ons(GDP, "ihyq", "qna"),
      US: fred("GDPC1", "pop", "not annualised"),
      EA: fred("CLVMNACSCAB1GQEA19", "pop"),
      DE: fred("CLVMNACSCAB1GQDE", "pop"),
      FR: fred("CLVMNACSCAB1GQFR", "pop"),
      JP: fred("JPNRGDPEXP", "pop"),
    },
  },
  {
    id: "gdp_yoy",
    label: "Real GDP, % y/y",
    group: "Growth",
    unit: "%",
    series: {
      UK: ons(GDP, "ihyr", "qna"),
      US: fred("GDPC1", "yoy"),
      EA: fred("CLVMNACSCAB1GQEA19", "yoy"),
      DE: fred("CLVMNACSCAB1GQDE", "yoy"),
      FR: fred("CLVMNACSCAB1GQFR", "yoy"),
      JP: fred("JPNRGDPEXP", "yoy"),
    },
  },
  {
    id: "gdp_mom",
    label: "Monthly GDP, % m/m",
    group: "Growth",
    unit: "%",
    series: { UK: ons(GDP, "ecy2", "mgdp", "pop", "GVA, monthly") },
  },
  {
    id: "cpi",
    label: "CPI inflation, % y/y",
    group: "Inflation",
    unit: "%",
    series: {
      UK: ons(INFL, "d7g7", "mm23"),
      US: fred("CPIAUCSL", "yoy"),
      EA: fred("CP0000EZ19M086NEST", "yoy", "HICP"),
      DE: fred("CP0000DEM086NEST", "yoy", "HICP"),
      FR: fred("CP0000FRM086NEST", "yoy", "HICP"),
    },
  },
  {
    id: "core",
    label: "Core inflation, % y/y",
    group: "Inflation",
    unit: "%",
    series: {
      UK: ons(INFL, "dko8", "mm23", "level", "CPI excl. energy, food, alcohol & tobacco"),
      US: fred("CPILFESL", "yoy", "CPI excl. food & energy"),
      EA: ecb("ICP/M.U2.N.XEF000.4.ANR", "HICP excl. energy, food, alcohol & tobacco"),
    },
  },
  {
    id: "rpi",
    label: "RPI / PCE inflation, % y/y",
    group: "Inflation",
    unit: "%",
    series: {
      UK: ons(INFL, "czbh", "mm23", "level", "RPI"),
      US: fred("PCEPILFE", "yoy", "Core PCE (the Fed's target measure)"),
    },
  },
  {
    id: "unemp",
    label: "Unemployment rate, %",
    group: "Labour market",
    unit: "%",
    series: {
      UK: ons(`${LAB}/peoplenotinwork/unemployment`, "mgsx", "lms"),
      US: fred("UNRATE"),
      EA: ecb("LFSI/M.I9.S.UNEHRT.TOTAL0.15_74.T"),
      DE: fred("LRHUTTTTDEM156S"),
      FR: fred("LRHUTTTTFRM156S"),
      JP: fred("LRHUTTTTJPM156S"),
    },
  },
  {
    id: "wages",
    label: "Pay growth, % y/y",
    group: "Labour market",
    unit: "%",
    series: {
      UK: ons(`${LAB}/peopleinwork/earningsandworkinghours`, "kai9", "lms", "level", "Regular pay, 3-month average"),
      US: fred("CES0500000003", "yoy", "Average hourly earnings"),
    },
  },
  {
    id: "payrolls",
    label: "Payrolls, monthly change (k)",
    group: "Labour market",
    unit: "k",
    series: { US: fred("PAYEMS", "diff", "Non-farm payrolls") },
  },
  {
    id: "policy",
    label: "Policy rate, %",
    group: "Rates",
    unit: "%",
    series: {
      UK: { source: "boe", id: "IUDBEDR", transform: "level", note: "Bank Rate" },
      US: fred("DFEDTARU", "level", "Fed funds target, upper bound"),
      EA: fred("ECBDFR", "level", "ECB deposit rate"),
    },
  },
  {
    id: "debt",
    label: "Public sector net debt, % GDP",
    group: "Public finances",
    unit: "%",
    series: { UK: ons(PSF, "hf6x", "pusf", "level", "Excl. public sector banks") },
  },
  {
    id: "psnb",
    label: "Public sector borrowing, month (£bn)",
    group: "Public finances",
    unit: "£bn",
    series: { UK: { ...ons(PSF, "j5ii", "pusf", "level", "PSNB excl. public sector banks"), scale: -0.001 } },
  },
];

// IMF World Economic Outlook (annual, with forecasts), for a like-for-like comparison.
export const IMF_ECONOMIES = [
  { code: "GBR", name: "UK" },
  { code: "USA", name: "US" },
  { code: "EURO", name: "Euro area" },
  { code: "DEU", name: "Germany" },
  { code: "FRA", name: "France" },
  { code: "JPN", name: "Japan" },
  { code: "CHN", name: "China" },
];
export const IMF_INDICATORS = [
  { code: "NGDP_RPCH", label: "Real GDP growth, %" },
  { code: "PCPIPCH", label: "Inflation (average CPI), %" },
  { code: "LUR", label: "Unemployment, %" },
  { code: "GGXWDG_NGDP", label: "Government gross debt, % GDP" },
  { code: "GGXCNL_NGDP", label: "Government balance, % GDP" },
  { code: "BCA_NGDPD", label: "Current account, % GDP" },
];
