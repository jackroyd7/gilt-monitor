// Commodities data: daily spot prices and US crude stocks from FRED (EIA series), and
// CFTC disaggregated positioning (managed money vs producers/merchants).

import type { CotFields, CotRow } from "./fx";

export const COMMODITY_SERIES = [
  { id: "BRENT", fred: "DCOILBRENTEU", eia: undefined, name: "Brent crude", unit: "$/bbl", digits: 2, tv: "TVC:UKOIL" },
  { id: "WTI", fred: "DCOILWTICO", eia: undefined, name: "WTI crude", unit: "$/bbl", digits: 2, tv: "TVC:USOIL" },
  { id: "HH", fred: "DHHNGSP", eia: undefined, name: "US natural gas (Henry Hub)", unit: "$/MMBtu", digits: 2, tv: "CAPITALCOM:NATURALGAS" },
  // Not on FRED: read from EIA's spreadsheet download (see eiaXls in scripts/sources/commodities.ts).
  { id: "CRUDE_STOCKS", fred: undefined, eia: "WCESTUS1", name: "US crude stocks (ex SPR)", unit: "m bbl", digits: 1, tv: undefined },
] as const;
export type CommodityId = (typeof COMMODITY_SERIES)[number]["id"];

/** Futures for the "By sector" table, as Yahoo Finance symbols (quotes stored under "YF:<symbol>"). */
export const COMMODITY_SECTORS: { sector: string; items: [string, string][] }[] = [
  { sector: "Energy", items: [["BZ=F", "Brent crude"], ["CL=F", "WTI crude"], ["NG=F", "US natural gas"], ["RB=F", "Gasoline"], ["HO=F", "Heating oil"]] },
  { sector: "Metals", items: [["GC=F", "Gold"], ["SI=F", "Silver"], ["PL=F", "Platinum"], ["PA=F", "Palladium"], ["HG=F", "Copper"], ["ALI=F", "Aluminium"]] },
  { sector: "Agriculture", items: [["ZW=F", "Wheat"], ["ZC=F", "Corn"], ["ZS=F", "Soybeans"], ["KC=F", "Coffee"], ["SB=F", "Sugar"], ["CC=F", "Cocoa"]] },
];

export const COMMODITY_COT = [
  { id: "CRUDE", code: "067651", name: "WTI crude" },
  { id: "NATGAS", code: "023651", name: "Natural gas" },
  { id: "GOLD", code: "088691", name: "Gold" },
  { id: "SILVER", code: "084691", name: "Silver" },
  { id: "COPPER", code: "085692", name: "Copper" },
  { id: "CORN", code: "002602", name: "Corn" },
  { id: "WHEAT", code: "001602", name: "Wheat" },
  { id: "SOYBEANS", code: "005602", name: "Soybeans" },
] as const;
export type CommodityCotId = (typeof COMMODITY_COT)[number]["id"];

/** Disaggregated report: managed money ("a") and producers/merchants/users ("b"). */
export const DISAGG_FIELDS: CotFields = {
  aLong: /^m_money_positions_long(_all)?$/,
  aShort: /^m_money_positions_short(_all)?$/,
  bLong: /^prod_merc_positions_long(_all)?$/,
  bShort: /^prod_merc_positions_short(_all)?$/,
};

/** EIA history workbook (sheet "Data 1": a date column then the series) → [date, value][]. */
export function parseEiaSheet(rows: unknown[][]): [string, number][] {
  const out: [string, number][] = [];
  for (const r of rows) {
    const [d, v] = r;
    let iso: string | null = null;
    if (d instanceof Date && !isNaN(d.getTime())) iso = d.toISOString().slice(0, 10);
    else if (typeof d === "number" && d > 20000 && d < 80000) iso = new Date(Date.UTC(1899, 11, 30) + d * 86_400_000).toISOString().slice(0, 10);
    if (iso && typeof v === "number" && Number.isFinite(v)) out.push([iso, v]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

export interface CommodityData {
  updatedAt: string;
  /** prices[id] = [date, value][] oldest first. */
  prices: Partial<Record<CommodityId, [string, number][]>>;
  cot: Partial<Record<CommodityCotId, Record<string, CotRow>>>;
}
