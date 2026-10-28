// Commodities data: daily spot prices and US crude stocks from FRED (EIA series), and
// CFTC disaggregated positioning (managed money vs producers/merchants).

import type { CotFields, CotRow } from "./fx";

export const COMMODITY_SERIES = [
  { id: "BRENT", fred: "DCOILBRENTEU", name: "Brent crude", unit: "$/bbl", digits: 2, tv: "TVC:UKOIL" },
  { id: "WTI", fred: "DCOILWTICO", name: "WTI crude", unit: "$/bbl", digits: 2, tv: "TVC:USOIL" },
  { id: "HH", fred: "DHHNGSP", name: "US natural gas (Henry Hub)", unit: "$/MMBtu", digits: 2, tv: "CAPITALCOM:NATURALGAS" },
  { id: "CRUDE_STOCKS", fred: "WCESTUS1", name: "US crude stocks (ex SPR)", unit: "m bbl", digits: 1, tv: undefined },
] as const;
export type CommodityId = (typeof COMMODITY_SERIES)[number]["id"];

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

export interface CommodityData {
  updatedAt: string;
  /** prices[id] = [date, value][] oldest first. */
  prices: Partial<Record<CommodityId, [string, number][]>>;
  cot: Partial<Record<CommodityCotId, Record<string, CotRow>>>;
}
