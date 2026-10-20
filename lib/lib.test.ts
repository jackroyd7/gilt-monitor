import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { couponSchedule, giltModDuration, giltYieldFromClean, parseCoupon } from "./bond";
import { interpolate, mergeCurveSets, toSemiannual } from "./curve";
import { fitNelsonSiegel, nsValue } from "./fit";
import {
  boeKindFromFilename,
  parseBoeWorkbook,
  parseBundesbankSdmxCsv,
  parseDate,
  parseDmoText,
  parseUstCsv,
} from "./parsers";
import type { CurveSet } from "./types";

const close = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("parseCoupon handles unicode fractions, slashes and decimals", () => {
  assert.equal(parseCoupon("4¼% Treasury Gilt 2027"), 4.25);
  assert.equal(parseCoupon("0 1/8% Index-linked Treasury Gilt 2028"), 0.125);
  assert.equal(parseCoupon("0⅝% Treasury Gilt 2035"), 0.625);
  assert.equal(parseCoupon("4.375% Treasury Gilt 2054"), 4.375);
  assert.equal(parseCoupon("Treasury Gilt"), null);
});

test("coupon schedule steps back from maturity in 6-month periods", () => {
  const s = couponSchedule("2030-01-31", "2026-10-21");
  assert.equal(s.previous, "2026-07-31");
  assert.equal(s.future[0], "2027-01-31");
  assert.equal(s.future.at(-1), "2030-01-31");
  assert.equal(s.future.length, 7);
});

test("a gilt priced at par on a coupon date yields its coupon", () => {
  // Trade 2026-07-21 (Tue) settles 2026-07-22, a coupon date of a 22 Jul maturity.
  const r = giltYieldFromClean(100, 4, "2036-07-22", "2026-07-21");
  assert.ok(r);
  close(r.yield, 4, 1e-8);
  close(r.accrued, 0, 1e-12);
});

test("yield falls as price rises, and duration is sane", () => {
  const lo = giltYieldFromClean(95, 4, "2036-07-22", "2026-10-20")!;
  const hi = giltYieldFromClean(105, 4, "2036-07-22", "2026-10-20")!;
  assert.ok(lo.yield > hi.yield);
  assert.ok(lo.modDuration > 7 && lo.modDuration < 9);
  close(giltModDuration(4, "2036-07-22", "2026-10-20", lo.yield)!, lo.modDuration, 1e-9);
});

test("ex-dividend gilts carry negative accrued interest", () => {
  // Coupon 2026-10-22; settlement 2026-10-21 is inside the 7-business-day ex-div window.
  const r = giltYieldFromClean(100, 4, "2030-10-22", "2026-10-20")!;
  assert.ok(r.accrued < 0);
});

test("interpolate is linear and never extrapolates", () => {
  assert.equal(interpolate([1, 2, 5], [1, 2, null], 1.5), 1.5);
  assert.equal(interpolate([1, 2, 5], [1, 2, null], 3), null);
  assert.equal(interpolate([1, 2], [1, 2], 0.5), null);
});

test("compounding conversions agree at low rates and differ sensibly", () => {
  close(toSemiannual(4, "zero_cc"), 4.0403, 1e-3);
  close(toSemiannual(4, "zero_annual"), 3.9608, 1e-3);
  assert.equal(toSemiannual(4, "par_semiannual"), 4);
});

test("merge keeps old rows, prefers fresh ones, and unions tenor grids", () => {
  const base = { id: "uk_nominal", label: "", source: "", basis: "zero_cc" } as const;
  const old: CurveSet = { ...base, tenors: [1, 2], rows: { "2026-01-01": [1, 2], "2026-01-02": [1, 2] } };
  const fresh: CurveSet = { ...base, tenors: [1, 2, 3], rows: { "2026-01-02": [5, 6, 7] } };
  const m = mergeCurveSets(old, fresh, "2026-01-01");
  assert.deepEqual(m.tenors, [1, 2, 3]);
  assert.deepEqual(m.rows["2026-01-01"], [1, 2, null]);
  assert.deepEqual(m.rows["2026-01-02"], [5, 6, 7]);
  assert.equal(Object.keys(mergeCurveSets(old, fresh, "2026-01-02").rows).length, 1);
});

test("Nelson-Siegel fit recovers a known curve", () => {
  const truth = { b0: 5, b1: -1, b2: 1.5, tau: 2.5, rmse: 0 };
  const pts = [0.6, 1, 2, 3, 5, 7, 10, 15, 20, 30, 40].map((t) => ({ t, y: nsValue(truth, t) }));
  const fit = fitNelsonSiegel(pts)!;
  assert.ok(fit.rmse < 0.002);
  for (const t of [1.5, 8, 25]) close(nsValue(fit, t), nsValue(truth, t), 0.005);
});

test("parseDate understands the formats the sources use", () => {
  assert.equal(parseDate("2026-10-20T00:00:00"), "2026-10-20");
  assert.equal(parseDate("22-Jan-2027"), "2027-01-22");
  assert.equal(parseDate("22 January 2027"), "2027-01-22");
  assert.equal(parseDate("22/01/2027"), "2027-01-22");
  assert.equal(parseDate("01/22/2027", { us: true }), "2027-01-22");
  assert.equal(parseDate(46315), "2026-10-20");
  assert.equal(parseDate("years:"), null);
});

test("US Treasury CSV", () => {
  const csv = 'Date,"1 Mo","6 Mo","1 Yr","10 Yr","30 Yr"\n10/17/2026,4.10,4.00,3.90,4.20,4.60\n10/16/2026,4.11,,3.91,4.25,4.62\n';
  const r = parseUstCsv(csv);
  close(r.tenors[0], 1 / 12, 1e-12);
  assert.deepEqual(r.tenors.slice(1), [0.5, 1, 10, 30]);
  assert.deepEqual(r.rows["2026-10-17"], [4.1, 4, 3.9, 4.2, 4.6]);
  assert.equal(r.rows["2026-10-16"][1], null);
});

test("Bundesbank SDMX-CSV", () => {
  const csv = [
    "KEY,FREQ,BBK_STD_MATURITY,TIME_PERIOD,OBS_VALUE",
    "BBSIS.D.I.ZST.ZI.EUR.S1311.B.A604.R02XX.R.A.A._Z._Z.A,D,R02XX,2026-10-16,2.10",
    "BBSIS.D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A,D,R10XX,2026-10-16,2.65",
    "BBSIS.D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A,D,R10XX,2026-10-15,2.60",
  ].join("\n");
  const r = parseBundesbankSdmxCsv(csv);
  assert.deepEqual(r.tenors, [2, 10]);
  assert.deepEqual(r.rows["2026-10-16"], [2.1, 2.65]);
  assert.deepEqual(r.rows["2026-10-15"], [null, 2.6]);
});

test("DMO XML records map to gilts by ISIN", () => {
  const xml = `<?xml version="1.0"?><Report><Data>
    <View_GILTS_IN_ISSUE INSTRUMENT_TYPE="Conventional " INSTRUMENT_NAME="4¼% Treasury Gilt 2027" ISIN_CODE="GB00B16NNR78"
      REDEMPTION_DATE="2027-12-07T00:00:00" TOTAL_AMOUNT_IN_ISSUE="40000" />
    <View_GILTS_IN_ISSUE INSTRUMENT_TYPE="Index-linked 3 months" INSTRUMENT_NAME="0 1/8% Index-linked Treasury Gilt 2028"
      ISIN_CODE="GB00BZ1NTB69" REDEMPTION_DATE="2028-08-10T00:00:00" TOTAL_AMOUNT_IN_ISSUE="15000" />
    <Junk A="1" B="2" C="3" />
  </Data></Report>`;
  const m = parseDmoText(xml);
  assert.equal(m.size, 2);
  const g = m.get("GB00B16NNR78")!;
  assert.equal(g.type, "conventional");
  assert.equal(g.coupon, 4.25);
  assert.equal(g.maturity, "2027-12-07");
  assert.equal(g.amountInIssue, 40000);
  assert.equal(m.get("GB00BZ1NTB69")!.type, "index-linked");

  const prices = parseDmoText(
    `<R><P ISIN_CODE="GB00B16NNR78" INSTRUMENT_NAME="4¼% Treasury Gilt 2027" CLEAN_PRICE="100.12" DIRTY_PRICE="101.5" YIELD="4.11" /></R>`,
  );
  assert.equal(prices.get("GB00B16NNR78")!.cleanPrice, 100.12);
  assert.equal(prices.get("GB00B16NNR78")!.yield, 4.11);
});

test("BoE workbook: finds the long-end spot sheet, tenor header and dated rows", () => {
  const wb = XLSX.utils.book_new();
  const spot = [
    ["UK nominal spot curve"],
    [],
    ["years:", 0.5, 1, 1.5, 2, 2.5, 3],
    [new Date(Date.UTC(2026, 9, 16)), 3.9, 3.85, 3.8, 3.82, 3.86, 3.9],
    [new Date(Date.UTC(2026, 9, 19)), 3.95, 3.9, null, 3.88, 3.9, 3.95],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["x"], ["years:", 1, 2, 3, 4, 5, 6]]), "3. spot, short end");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(spot), "4. spot curve");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const r = parseBoeWorkbook(new Uint8Array(buf))!;
  assert.deepEqual(r.tenors, [0.5, 1, 1.5, 2, 2.5, 3]);
  assert.deepEqual(Object.keys(r.rows).sort(), ["2026-10-16", "2026-10-19"]);
  assert.equal(r.rows["2026-10-19"][2], null);

  assert.equal(boeKindFromFilename("GLC Nominal daily data current month.xlsx"), "nominal");
  assert.equal(boeKindFromFilename("OIS daily data current month.xlsx"), "ois");
  assert.equal(boeKindFromFilename("GLC Real daily data current month.xlsx"), "real");
  assert.equal(boeKindFromFilename("readme.txt"), null);
});
