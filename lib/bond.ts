// Conventional gilt maths: semi-annual coupons, act/act accrual, 7-business-day
// ex-dividend period, settlement T+1. Bank holidays are ignored (weekends only),
// which can move a yield by a fraction of a basis point around holidays.

const FRACTIONS: Record<string, number> = {
  "¼": 0.25, "½": 0.5, "¾": 0.75, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
  "⅓": 1 / 3, "⅔": 2 / 3,
};

/** "4¼% Treasury Gilt 2027" -> 4.25, "0 1/8% Index-linked ..." -> 0.125, "4.25% ..." -> 4.25 */
export function parseCoupon(name: string): number | null {
  const m = name.match(/^\s*(\d+(?:\.\d+)?)?\s*([¼½¾⅛⅜⅝⅞⅓⅔]|\d+\/\d+)?\s*%/);
  if (!m || (m[1] == null && m[2] == null)) return null;
  let c = m[1] ? parseFloat(m[1]) : 0;
  if (m[2]) {
    if (m[2] in FRACTIONS) c += FRACTIONS[m[2]];
    else {
      const [n, d] = m[2].split("/").map(Number);
      c += n / d;
    }
  }
  return c;
}

const DAY = 86400000;
const toMs = (iso: string) => Date.parse(iso + "T00:00:00Z");
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return toIso(target.getTime());
}

export function addBusinessDays(iso: string, n: number): string {
  let ms = toMs(iso);
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    ms += step * DAY;
    const wd = new Date(ms).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return toIso(ms);
}

/** Coupon dates strictly after `settle`, up to and including maturity, plus the previous one. */
export function couponSchedule(maturity: string, settle: string) {
  const future: string[] = [];
  let k = 0;
  let d = maturity;
  while (d > settle) {
    future.unshift(d);
    k++;
    d = addMonths(maturity, -6 * k);
  }
  return { previous: d, future };
}

export interface BondCalc {
  accrued: number;
  dirty: number;
  yield: number; // percent, semi-annual
  modDuration: number;
}

/** Gross redemption yield from a clean price per £100 nominal. */
export function giltYieldFromClean(
  clean: number,
  couponPct: number,
  maturity: string,
  tradeDate: string,
): BondCalc | null {
  const settle = addBusinessDays(tradeDate, 1);
  if (maturity <= settle) return null;
  const { previous, future } = couponSchedule(maturity, settle);
  const c = couponPct / 2;
  const next = future[0];
  const periodDays = (toMs(next) - toMs(previous)) / DAY;
  const exDiv = settle > addBusinessDays(next, -7);
  const accruedFrac = (toMs(settle) - toMs(previous)) / DAY / periodDays;
  const accrued = exDiv ? -c * (1 - accruedFrac) : c * accruedFrac;
  const dirty = clean + accrued;
  const v0 = (toMs(next) - toMs(settle)) / DAY / periodDays; // fraction of period to next coupon

  const flows = future.map((_, i) => ({
    t: v0 + i,
    cf: (i === 0 && exDiv ? 0 : c) + (i === future.length - 1 ? 100 : 0),
  }));
  const pv = (y: number) => flows.reduce((s, f) => s + f.cf / Math.pow(1 + y / 2, f.t), 0);
  const dpv = (y: number) =>
    flows.reduce((s, f) => s - (f.t / 2) * f.cf / Math.pow(1 + y / 2, f.t + 1), 0);

  let y = couponPct / 100 || 0.04;
  for (let i = 0; i < 50; i++) {
    const diff = pv(y) - dirty;
    if (Math.abs(diff) < 1e-10) break;
    y -= diff / dpv(y);
    if (!isFinite(y) || y <= -0.99) return null;
  }
  return { accrued, dirty, yield: y * 100, modDuration: -dpv(y) / pv(y) };
}

/** Modified duration at a given yield (percent); used when the source supplies the yield. */
export function giltModDuration(couponPct: number, maturity: string, tradeDate: string, yieldPct: number) {
  const settle = addBusinessDays(tradeDate, 1);
  if (maturity <= settle) return null;
  const { previous, future } = couponSchedule(maturity, settle);
  const c = couponPct / 2;
  const v0 = (toMs(future[0]) - toMs(settle)) / (toMs(future[0]) - toMs(previous));
  const y = yieldPct / 100;
  let pv = 0;
  let dpv = 0;
  future.forEach((_, i) => {
    const t = v0 + i;
    const cf = c + (i === future.length - 1 ? 100 : 0);
    pv += cf / Math.pow(1 + y / 2, t);
    dpv += (t / 2) * cf / Math.pow(1 + y / 2, t + 1);
  });
  return dpv / pv;
}

/** Accrued interest per £100 at a settlement date (negative inside the ex-dividend period). */
function accruedAt(couponPct: number, maturity: string, settle: string) {
  const { previous, future } = couponSchedule(maturity, settle);
  const c = couponPct / 2;
  const next = future[0];
  const exDiv = settle > addBusinessDays(next, -7);
  const frac = (toMs(settle) - toMs(previous)) / (toMs(next) - toMs(previous));
  return { accrued: exDiv ? -c * (1 - frac) : c * frac, exDiv, next };
}

export interface GiltForward {
  /** Forward settlement date. */
  settle: string;
  clean: number;
  yield: number;
}

/**
 * Forward clean price and yield of a conventional gilt for settlement `days` after spot
 * settlement, financed at `repoPct` (simple, act/365). Coupons received before the forward
 * date are reinvested at repo and reduce the forward price.
 */
export function giltForward(clean: number, couponPct: number, maturity: string, tradeDate: string, repoPct: number, days: number): GiltForward | null {
  const spot = addBusinessDays(tradeDate, 1);
  const fwd = toIso(toMs(spot) + days * DAY);
  if (maturity <= addBusinessDays(fwd, 5)) return null;
  const r = repoPct / 100;
  const a0 = accruedAt(couponPct, maturity, spot);
  const dirty0 = clean + a0.accrued;
  // Coupons paid between spot and forward settlement; one already gone ex-dividend isn't ours.
  const paid = couponSchedule(maturity, spot).future.filter((d, i) => d <= fwd && !(i === 0 && a0.exDiv));
  const carried = paid.reduce((s, d) => s + (couponPct / 2) * (1 + (r * (toMs(fwd) - toMs(d))) / DAY / 365), 0);
  const dirtyF = dirty0 * (1 + (r * days) / 365) - carried;
  const cleanF = dirtyF - accruedAt(couponPct, maturity, fwd).accrued;
  // Yield on the forward date: price the bond as if trading one business day earlier.
  const calc = giltYieldFromClean(cleanF, couponPct, maturity, addBusinessDays(fwd, -1));
  return calc ? { settle: fwd, clean: cleanF, yield: calc.yield } : null;
}
