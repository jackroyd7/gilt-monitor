import "server-only";
import { loadFx } from "./data";
import { fxSeries, type FxId } from "./fx";
import { stockHistory } from "./stock-history";

/**
 * Units of `currency` per £1, for turning local share prices into sterling: the BoE's daily
 * rates for USD, EUR, JPY and CHF, Yahoo's for anything else. "GBp" (pence) is 100.
 */
export async function unitsPerPound(
  currency: string | undefined,
): Promise<number | null> {
  if (!currency || currency === "GBP") return 1;
  if (currency === "GBp" || currency === "GBX") return 100;
  const id = `GBP${currency.toUpperCase()}` as FxId;
  if (["GBPUSD", "GBPEUR", "GBPJPY", "GBPCHF"].includes(id)) {
    const last = fxSeries((await loadFx()).fx, id).at(-1);
    if (last) return last[1];
  }
  const h = await stockHistory(`FX:GBP${currency.toUpperCase()}`);
  return h?.price ?? null;
}
