import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { couponSchedule, giltModDuration, giltYieldFromClean, parseCoupon } from "./bond";
import { interpolate, mergeCurveSets, toSemiannual } from "./curve";
import { fitNelsonSiegel, nsValue, robustFit } from "./fit";
import {
  boeKindFromFilename,
  parseBoeWorkbook,
  parseBundesbankSdmxCsv,
  parseDate,
  parseDmoText,
  parseUstCsv,
  indexLag,
  excludedGilt,
} from "./parsers";
import { closeDate, giltSeries, recordCloses, yieldChanges, emptyHistory, previousBusinessDays, withLatestCloses, repeatsPreviousClose } from "./history";
import { normaliseYieldUnits, parseBondRow, parsePriceRow, withLive } from "./live-parse";
import { giltRows } from "./analytics";
import { googleNewsUrl, isMuted, mergeItems, parseFeed, scoreItems } from "./news";
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

test("giltsyield bond and price rows parse with loose column names", () => {
  const b = parseBondRow({ ticker: "TG35", isin: "GB00BMV7TC88", coupon: "4.25", maturity: "2035-03-07", type: "Conventional", name: "4¼% Treasury Gilt 2035" });
  assert.deepEqual(b, { ticker: "TG35", isin: "GB00BMV7TC88", name: "4¼% Treasury Gilt 2035", type: "conventional", coupon: 4.25, maturity: "2035-03-07", indexLag: undefined });
  assert.equal(parseBondRow({ ticker: "IL28", isin: "X", name: "0 1/8% Index-linked Treasury Gilt 2028", maturity: "2028-08-10" }).type, "index-linked");

  const p = parsePriceRow({ clean_price: 98.5, dirty_price: "99.10", accrued_interest: 0.6, yield_to_maturity: 4.512, current_yield: 4.3, timestamp: "2026-10-20T14:30:00" });
  assert.deepEqual(p, { clean: 98.5, dirty: 99.1, ytm: 4.512, time: "2026-10-20T14:30:00" });
});

test("decimal yields are converted to percent", () => {
  const g = (y: number, type: "conventional" | "index-linked" = "conventional") =>
    ({ isin: "x", name: "", type, coupon: 1, maturity: "2030-01-01", cleanPrice: null, dirtyPrice: null, yield: y });
  const gilts = [g(0.041), g(0.045), g(0.048), g(0.005, "index-linked")];
  normaliseYieldUnits(gilts);
  assert.deepEqual(gilts.map((x) => +x.yield!.toFixed(4)), [4.1, 4.5, 4.8, 0.5]);
  const pct = [g(4.1), g(4.5)];
  normaliseYieldUnits(pct);
  assert.equal(pct[0].yield, 4.1);
});

test("live prices overlay the DMO close by ISIN and add unknown gilts", () => {
  const base = { name: "", type: "conventional" as const, coupon: 4, dirtyPrice: null };
  const dmo = {
    asOf: "2026-10-19",
    source: "DMO",
    gilts: [
      { ...base, isin: "A", maturity: "2030-01-01", cleanPrice: 99, yield: 4.2 },
      { ...base, isin: "B", maturity: "2035-01-01", cleanPrice: 95, yield: 4.6 },
    ],
  };
  const live = {
    fetchedAt: "2026-10-20T13:00:00Z",
    failed: 0,
    gilts: [
      { ...base, isin: "A", maturity: "2030-01-01", cleanPrice: 99.2, yield: 4.15, live: true },
      { ...base, isin: "C", maturity: "2028-01-01", cleanPrice: 100, yield: 4.0, live: true },
    ],
  };
  const m = withLive(dmo, live)!;
  assert.equal(m.asOf, "2026-10-20");
  assert.deepEqual(m.gilts.map((x) => [x.isin, x.yield, !!x.live]), [["C", 4.0, true], ["A", 4.15, true], ["B", 4.6, false]]);
  assert.equal(withLive(dmo, null), dmo);
});

test("index lag: 3-month by default, 8-month from text, ISIN or coupon/maturity", () => {
  assert.equal(indexLag("Index-linked 3 months"), 3);
  assert.equal(indexLag("Index-linked 8 months"), 8);
  assert.equal(indexLag("", "GB0008932666"), 8);
  assert.equal(indexLag("", "X", 2, "2035-01-26"), 8);
  assert.equal(indexLag("", "X", 0.125, "2035-01-26"), 3);
  assert.ok(excludedGilt({ type: "index-linked", indexLag: 8 }));
  assert.ok(!excludedGilt({ type: "index-linked", indexLag: 3 }));
  assert.ok(!excludedGilt({ type: "conventional" }));
  const m = parseDmoText(`<R><G INSTRUMENT_TYPE="Index-linked 8 months" INSTRUMENT_NAME="2% Index-linked Treasury Stock 2035" ISIN_CODE="GB0031790826" REDEMPTION_DATE="2035-01-26" /></R>`);
  assert.equal(m.get("GB0031790826")!.indexLag, 8);
});

test("gilt history records closes and computes 1d/1w/1m yield changes", () => {
  const g = (y: number) => ({ isin: "A", name: "A", type: "conventional" as const, coupon: 4, maturity: "2035-01-01", cleanPrice: 100, dirtyPrice: null, yield: y });
  const h = emptyHistory();
  recordCloses(h, "2026-09-18", [g(4.0)]); // > 1 month before
  recordCloses(h, "2026-10-12", [g(4.2)]); // 1 week before 10-20 is 10-13 -> uses 10-12
  recordCloses(h, "2026-10-19", [g(4.3)]);
  const s = giltSeries(h, "A");
  assert.equal(s.length, 3);
  const c = yieldChanges(s, { date: "2026-10-20", yield: 4.35 });
  assert.ok(Math.abs(c.d1! - 5) < 1e-9 && Math.abs(c.w1! - 15) < 1e-9 && Math.abs(c.m1! - 35) < 1e-9);
  // When the current yield is itself the latest close, compare with the day before it.
  const c2 = yieldChanges(s, { date: "2026-10-19", yield: 4.3 });
  assert.ok(Math.abs(c2.d1! - 10) < 1e-9);
  assert.deepEqual(yieldChanges([], { date: "2026-10-20", yield: 4 }), { d1: null, w1: null, m1: null });
});

test("close date: earlier timestamp is that day's close; today's only after 17:00 London", () => {
  const at = (iso: string) => new Date(iso);
  assert.equal(closeDate("2026-10-19T16:35:00+01:00", at("2026-10-20T08:00:00Z")), "2026-10-19");
  assert.equal(closeDate("2026-10-20T14:30:00+01:00", at("2026-10-20T13:40:00Z")), null);
  assert.equal(closeDate("2026-10-20T16:30:00+01:00", at("2026-10-20T18:15:00Z")), "2026-10-20");
  assert.equal(closeDate(undefined, at("2026-10-20T06:15:00Z")), "2026-10-19");
  assert.equal(closeDate(undefined, at("2026-10-19T06:15:00Z")), "2026-10-16"); // Monday morning -> Friday
  assert.deepEqual(previousBusinessDays("2026-10-19", 2), ["2026-10-16", "2026-10-15"]);
});

test("linker ASW proxy and breakeven", () => {
  const flat = (id: CurveSet["id"], v: number): CurveSet => ({ id, label: "", source: "", basis: "par_semiannual", tenors: [1, 50], rows: { "2026-10-20": [v, v] } });
  const curves = { uk_ois: flat("uk_ois", 4), uk_inflation: flat("uk_inflation", 3) };
  const conv = [3, 5, 8, 12, 20, 30].map((y, i) => ({ isin: `C${i}`, name: "", type: "conventional" as const, coupon: 4, maturity: `${2026 + y}-10-20`, cleanPrice: null, dirtyPrice: null, yield: 4.5 }));
  const il = { isin: "L", name: "", type: "index-linked" as const, coupon: 0.125, maturity: "2036-10-20", cleanPrice: null, dirtyPrice: null, yield: 1.2 };
  const { rows } = giltRows({ asOf: "2026-10-20", source: "", gilts: [...conv, il] }, curves);
  const l = rows.find((r) => r.isin === "L")!;
  // (1 + 1.2/200)(1 + 3/200) - 1, x200 = 4.218%; minus 4% OIS = 21.8bp
  assert.ok(Math.abs(l.oisSpread! - 21.8) < 0.01, String(l.oisSpread));
  assert.ok(Math.abs(l.bei! - 3.3) < 1e-6, String(l.bei));
  assert.ok(Math.abs(rows[0].oisSpread! - 50) < 1e-9);
});

test("robust fit drops a gilt far off the curve and keeps the rest", () => {
  const truth = { b0: 5, b1: -0.6, b2: 1, tau: 2.5, rmse: 0 };
  const pts = [1, 2, 3, 4, 5, 7, 10, 12, 15, 20, 25, 30, 40].map((t, i) => ({ t, y: nsValue(truth, t) + (i % 2 ? 0.02 : -0.02) }));
  pts.push({ t: 6, y: nsValue(truth, 6) + 1.5 }); // a 150bp outlier
  const { fit, dropped } = robustFit(pts);
  assert.deepEqual([...dropped], [pts.length - 1]);
  assert.ok(Math.abs(nsValue(fit!, 6) - nsValue(truth, 6)) < 0.03);
});

test("news: parses Google News RSS (title/source split) and Atom, merges topics, scores", () => {
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>"gilts" - Google News</title>
    <item><title>Gilt yields jump after budget - Financial Times</title><link>https://news.google.com/rss/articles/abc</link>
      <pubDate>Fri, 23 Oct 2026 09:15:00 GMT</pubDate><source url="https://www.ft.com">Financial Times</source></item>
    <item><title>Pound slips &amp; stocks rise - Reuters</title><link>https://news.google.com/rss/articles/def</link>
      <pubDate>Thu, 22 Oct 2026 16:00:00 GMT</pubDate></item>
    <item><title>No date</title><link>https://x</link></item>
  </channel></rss>`;
  const a = parseFeed(rss, "gilts");
  assert.equal(a.length, 2);
  assert.deepEqual([a[0].title, a[0].source], ["Gilt yields jump after budget", "Financial Times"]);
  assert.deepEqual([a[1].title, a[1].source], ["Pound slips & stocks rise", "Reuters"]);

  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Bank of England news</title>
    <entry><title>Monetary Policy Summary, October 2026</title><link href="https://www.bankofengland.co.uk/mps"/>
      <updated>2026-10-23T12:00:00Z</updated></entry></feed>`;
  const b = parseFeed(atom, "boe");
  assert.deepEqual([b[0].title, b[0].url, b[0].source], ["Monetary Policy Summary, October 2026", "https://www.bankofengland.co.uk/mps", "Bank of England news"]);

  const dup = parseFeed(rss, "fiscal");
  const merged = mergeItems([a, b, dup]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].title, "Monetary Policy Summary, October 2026"); // newest first
  assert.deepEqual(merged.find((i) => i.title.startsWith("Gilt"))!.topics, ["gilts", "fiscal"]);

  const scored = scoreItems(merged, ["gilt", "yields", "budget"], Date.parse("2026-10-23T13:00:00Z"));
  const top = [...scored].sort((x, y) => y.score - x.score)[0];
  assert.equal(top.title, "Gilt yields jump after budget");
  assert.ok(isMuted("Pound slips & stocks rise", ["STOCKS"]));
  assert.ok(!isMuted("Pound slips", ["", " "]));
  assert.ok(googleNewsUrl('"gilt yields"').includes("when%3A7d"));
});

test("gilts without a price fall back to their latest recorded close", () => {
  const g = (isin: string, y: number | null) => ({ isin, name: isin, type: "conventional" as const, coupon: 4, maturity: "2035-01-01", cleanPrice: null, dirtyPrice: null, yield: y });
  const h = emptyHistory();
  recordCloses(h, "2026-10-21", [g("A", 4.1), g("B", 4.4)]);
  recordCloses(h, "2026-10-22", [g("A", 4.2)]);
  const out = withLatestCloses({ asOf: "2026-10-23", source: "", gilts: [g("A", null), g("B", null), g("C", null), g("D", 5)] }, h)!;
  assert.deepEqual(out.gilts.map((x) => [x.isin, x.yield, x.priceDate]), [["A", 4.2, "2026-10-22"], ["B", 4.4, "2026-10-21"], ["C", null, undefined], ["D", 5, undefined]]);
  assert.equal(out.priceDate, "2026-10-22");
});

test("a snapshot that repeats the previous close is detected", () => {
  const g = (isin: string, p: number) => ({ isin, name: isin, type: "conventional" as const, coupon: 4, maturity: "2035-01-01", cleanPrice: p, dirtyPrice: null, yield: 4 });
  const h = emptyHistory();
  const day1 = Array.from({ length: 20 }, (_, i) => g(`G${i}`, 90 + i));
  recordCloses(h, "2026-10-22", day1);
  assert.equal(repeatsPreviousClose(h, "2026-10-23", day1), "2026-10-22");
  const moved = day1.map((x, i) => (i % 3 ? { ...x, cleanPrice: x.cleanPrice + 0.12 } : x));
  assert.equal(repeatsPreviousClose(h, "2026-10-23", moved), null);
  assert.equal(repeatsPreviousClose(emptyHistory(), "2026-10-23", day1), null);
});
