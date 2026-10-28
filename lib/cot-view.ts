import { cotNet, type CotRow } from "./fx";

/** Table/chart rows for the Positioning panel from CFTC history. */
export function cotRowsFor(contracts: readonly { id: string; name: string }[], rows: Partial<Record<string, Record<string, CotRow>>> | undefined) {
  return contracts.map((c) => {
    const h = cotNet(rows?.[c.id]);
    const a = h[h.length - 1];
    const b = h[h.length - 2];
    return {
      id: c.id,
      name: c.name,
      date: a?.date,
      assetManagers: a?.assetManagers ?? null,
      leveraged: a?.leveraged ?? null,
      amChange: a && b ? a.assetManagers - b.assetManagers : null,
      levChange: a && b ? a.leveraged - b.leveraged : null,
      amPctOi: a?.oi ? (a.assetManagers / a.oi) * 100 : null,
      levPctOi: a?.oi ? (a.leveraged / a.oi) * 100 : null,
      history: h.map(({ date, assetManagers, leveraged }) => ({ date, assetManagers, leveraged })),
    };
  });
}
