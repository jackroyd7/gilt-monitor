# Gilt Monitor

A self-updating dashboard for UK gilts:

- **Dashboard**: headline yields, curve slopes, breakevens, gilt − OIS, gilt − Bund and gilt − UST, with 1-day and 1-week moves.
- **Curves**: BoE nominal, real, implied-inflation and SONIA OIS zero curves against 1 week, 1 month, 3 months and 1 year ago, with tables of changes.
- **Gilts**: every gilt in issue with DMO price, yield, modified duration, and rich/cheap against a Nelson-Siegel fit.
- **vs OIS**: gilt − SONIA OIS by maturity, over time, and for each gilt (an asset-swap proxy).
- **Cross-market**: gilts against Bunds and US Treasuries by maturity and over time.
- **Portfolio**: your giltsyield.com holdings, P&L, book yields and upcoming cash flows, joined to the market data.

## How it works

```
GitHub Action (weekdays 07:15 / 13:15 / 19:15 UTC)
  └─ npm run fetch-data ─► data/*.json ─► git commit ─► Vercel redeploys
Browser ─► Vercel (password) ─► market pages read data/*.json
                             └─ Portfolio page calls giltsyield.com live with your key (server-side)
```

| Data | Source | Notes |
|---|---|---|
| Gilt nominal / real / inflation zero curves | Bank of England yield curves | Fitted spot curves, 0.5y steps |
| SONIA OIS zero curve | Bank of England yield curves | Same basis as the gilt curve |
| Gilts in issue and reference prices | UK Debt Management Office (D1A, D10B reports) | Close of business. If a yield is missing it is computed from the clean price (marked `*`) |
| Bund zero curve | Bundesbank BBSIS (Svensson) | 1–30y |
| US Treasury par curve | US Treasury daily par yield curve | 1m–30y |
| Your portfolio | giltsyield.com API | Fetched live; never stored |

Market data history is kept in `data/curves/*.json` (5 years by default, one line per day, so daily commits are small).

### Conventions and caveats

- All cross-curve arithmetic converts rates to **semi-annual compounding** first. BoE curves are treated as continuously compounded, Bundesbank as annually compounded, and the Treasury curve is already semi-annual.
- Bund and gilt curves are **zero** curves; the Treasury curve is a **par** curve. On an upward-sloping curve a par yield sits a little below the zero rate, so gilt − UST spreads carry a few bp of shape difference.
- **Gilt − OIS** on the curve pages compares the BoE gilt and OIS zero curves on the same basis. The per-gilt figure compares a bond's redemption yield with the OIS zero rate at its maturity. It is a relative-value **proxy**, not a par-par or z-spread asset swap. The OIS curve only extends as far as the BoE publishes it.
- No free official €STR or SOFR swap curves are used, so there are no Bund or UST asset swaps.
- Data is **end-of-day**: DMO prices the same evening, BoE curves by the next working day.

## Setup

1. **Vercel**: import this repo at vercel.com/new (framework: Next.js, no build settings needed).
2. In Vercel → Settings → Environment Variables, add:
   - `DASHBOARD_PASSWORD`: protects the whole site (any username).
   - `GILTSYIELD_API_KEY`: from your giltsyield.com Profile page.
3. **First data load**: GitHub → Actions → *Update market data* → *Run workflow*, ticking **backfill** to pull about 3 years of history. After that it runs on its own.

Each data commit triggers a Vercel deploy, so the site is current within a few minutes of each run.

## Local development

```bash
npm install
npm run demo-data                   # synthetic data in data-demo/ (git-ignored)
DATA_DIR=data-demo npm run dev      # http://localhost:3000, with a "Demo data" banner
npm run fetch-data                  # real data into data/ (needs internet)
npm test && npm run lint && npm run typecheck
```

## When a source breaks

Each source is fetched independently; a failure keeps the previous data and shows a red marker in the page footer (hover for the error). The Action log shows the detail. Upstream URLs can be overridden without code changes via env vars (see `.env.example`). Parsers live in `lib/parsers.ts` and find data by pattern (tenor header rows, column names) rather than fixed positions.
