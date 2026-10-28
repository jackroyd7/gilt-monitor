# Markets Monitor

A self-updating markets dashboard built around UK gilts. Tabs: **Overview**, **Gilts** (a menu of Dashboard, Gilts, Curves, vs OIS, Cross-market and Portfolio), **Equities**, **FX**, **Commodities**, **Charts** and **News**. On a phone the tabs move to a bar at the bottom of the screen. A switch in the header picks a light, dark or automatic theme.

- **Overview**: the **morning briefing** (weekdays about 06:40 UK time: Claude reads our closing data and the last day's headlines, searches the web for overnight moves and today's calendar, and writes at most 500 words on rates, equities, FX, commodities, macro and politics, and today's events), the ticker tape, key gilt numbers, TradingView's economic calendar, top headlines and benchmark cards.
- **Install as an app**: open the site in Safari on iPhone → Share → *Add to Home Screen*. It opens full-screen with its own icon. Sign in once and the device stays signed in for a year.
- **Charts tab**: search an index, stock, currency pair, commodity or bond yield and chart it full width. Recent symbols are remembered in the browser.

- **Dashboard**: headline yields, curve slopes, breakevens, gilt − OIS, gilt − Bund and gilt − UST, with 1-day and 1-week moves.
- **Charts**: every chart card has *Copy image* and *Save PNG* buttons (title and legend included, on-screen controls left out).
- **Curves**: BoE nominal, real, implied-inflation and SONIA OIS zero curves against 1 week, 1 month, 3 months and 1 year ago, with tables of changes.
- **Gilts**: every conventional and 3-month-lag index-linked gilt (the two old 8-month-lag linkers are excluded), filterable, with price, yield, ASW, 1d/1w/1m yield changes, rich/cheap against a fitted curve (real curve for linkers), breakeven and duration. Tick up to two gilts, or click them on the curve chart, to plot yield or price history, or the yield spread between them.
- **vs OIS**: gilt − SONIA OIS by maturity, over time, and for each gilt (an asset-swap proxy).
- **Cross-market**: gilts against Bunds and US Treasuries by maturity and over time.
- **Intraday prices**: with a giltsyield.com key, gilt prices and yields refresh about every 10 minutes (their update rate), with a *Refresh prices* button. The dashboard adds 2/5/10/30y yields from a curve fitted to those prices, against the DMO close.
- **Equities**: index cards, then a market picker (UK FTSE 100, US S&P 500 / Nasdaq 100, Germany DAX, France CAC 40) driving a heatmap by sector (coloured by 1D/1W/1M/YTD/1Y performance) and top movers; US and European sector ETF performance; volatility and style charts (VIX, value vs growth, small vs large, equal vs cap weight, FTSE 250 vs 100, Europe vs US); an **earnings calendar** (upcoming reports and last week's results with EPS and revenue against estimates, for the ~430 stocks on our list, with `FINNHUB_API_KEY`); equities news. Clicking a stock, or *Look up a stock…*, opens its page: quote, chart, financials, technical rating, company profile and the last week's news. Market ids and sector/style symbols are in `config/equities.ts`.
- **FX**: sterling levels and 1w/1m/YTD changes (BoE 4pm rates, plus the sterling effective index); GBP/USD and GBP/EUR against the UK − US and UK − Germany 2-year yield gap with their rolling 3-month correlation; realised volatility; carry (1y and 2y yield gaps); CFTC positioning of asset managers and leveraged funds in GBP, EUR, JPY and CHF futures; TradingView cross-rate grid and currency-strength map; FX news.
- **Economy**: latest growth, inflation, labour-market, policy-rate and UK public-finance figures for the UK, US, euro area, Germany, France and Japan (value, change on the previous release, period and trend), with a history chart comparing economies; plus the IMF World Economic Outlook (recent years and forecasts, including China). Series are listed in `config/macro.ts`.
- **Equities / FX / Commodities cards**: equity indices, FX spot and commodities as colour-coded ticker cards (TradingView's free widgets). Click **Edit layout** to add (from a list, or by searching a short catalogue of indices, bond yields, FX, commodities and ~400 large UK, US, French and German stocks, showing at most 8 suggestions), remove, or drag to reorder cards; the layout syncs across your devices when Upstash Redis is connected (Vercel → Storage), otherwise it is saved per browser. Clicking an instrument opens its chart in a popup (line chart by default; candles, intervals and indicators from the toolbar), not on tradingview.com. Symbols live in `config/markets.ts`.
- **News**: last week's headlines on the topics in `config/news.ts` (Google News searches plus the Bank of England feed), filterable by topic, searchable, rankable by relevance to gilts and UK rates, with muted words. Cached for 10 minutes; *Refresh* re-fetches. Clicking a headline opens a reader popup: full text for free-to-read sites (reader-mode extraction; paywalled sites are not fetched, and only public web addresses are), otherwise the headline with a link out. With `ANTHROPIC_API_KEY` set, *Market impact* asks Claude which markets the story matters for and why, on request.
- **Portfolio**: your giltsyield.com holdings, P&L, book yields and upcoming cash flows, joined to the market data.

## How it works

```
GitHub Action (weekdays 07:15 / 13:15 / 19:15 UTC)
  └─ npm run fetch-data ─► data/*.json ─► git commit ─► Vercel redeploys
Browser ─► Vercel (password) ─► curve pages read data/*.json (end of day)
                             ├─ Dashboard, Gilts, vs OIS overlay intraday giltsyield.com prices (cached 5 min)
                             └─ Portfolio page calls giltsyield.com live with your key (server-side)
```

| Data | Source | Notes |
|---|---|---|
| Gilt nominal / real / inflation zero curves | Bank of England yield curves | Fitted spot curves, 0.5y steps |
| SONIA OIS zero curve | Bank of England yield curves | Same basis as the gilt curve |
| Gilts in issue and reference prices | UK Debt Management Office (D1A, D10B reports) | Close of business. If a yield is missing it is computed from the clean price (marked `*`) |
| Bund zero curve | Bundesbank BBSIS (Svensson) | 1–30y |
| US Treasury par curve | US Treasury daily par yield curve | 1m–30y |
| Intraday gilt prices | giltsyield.com `/api/bonds/` + `/api/bond/price/<ticker>/` | ~10-minute updates; one call per gilt, 6 at a time, cached 5 min; DMO close fills any gaps |
| Daily close per gilt | giltsyield.com closes (with `GILTSYIELD_API_KEY` as a GitHub secret), else DMO | `data/gilt-history.json`, one line per day; drives 1d/1w/1m changes and history charts |
| Sterling FX rates and index | Bank of England database (XUDLUSS, XUDLERS, XUDLJYS, XUDLSFS, XUDLBK67) | Daily 4pm London; `data/fx.json` |
| FX futures positioning | CFTC Traders in Financial Futures (public reporting API) | Weekly; `data/cot.json` |
| Economic data | ONS (UK), FRED public CSV (US, plus OECD/Eurostat series for other economies), ECB data portal, BoE (Bank Rate), IMF DataMapper (WEO) | No keys needed; `data/macro.json`; each series' latest point is logged by the data job |
| Your portfolio | giltsyield.com API | Fetched live; never stored |

Market data history is kept in `data/curves/*.json` (5 years by default, one line per day, so daily commits are small).

### Conventions and caveats

- All cross-curve arithmetic converts rates to **semi-annual compounding** first. BoE curves are treated as continuously compounded, Bundesbank as annually compounded, and the Treasury curve is already semi-annual.
- Bund and gilt curves are **zero** curves; the Treasury curve is a **par** curve. On an upward-sloping curve a par yield sits a little below the zero rate, so gilt − UST spreads carry a few bp of shape difference.
- **Linkers**: yields are real. Their ASW proxy turns the real yield into a nominal equivalent with BoE implied RPI inflation at the same maturity, then subtracts OIS; it is blank where the BoE inflation or OIS curve doesn't reach. Breakeven is the fitted conventional yield at the same maturity minus the real yield.
- **Gilt − OIS** on the curve pages compares the BoE gilt and OIS zero curves on the same basis. The per-gilt figure compares a bond's redemption yield with the OIS zero rate at its maturity. It is a relative-value **proxy**, not a par-par or z-spread asset swap. The OIS curve only extends as far as the BoE publishes it.
- No free official €STR or SOFR swap curves are used, so there are no Bund or UST asset swaps.
- Curves are **end-of-day** (BoE by the next working day). Gilt prices are intraday when giltsyield.com is connected, otherwise the DMO close. The intraday fitted 2/5/10/30y yields are yield-to-maturity fits, so they are not identical to BoE zero rates; use their change vs the DMO close as the live move.
- giltsyield.com also offers a SQL endpoint (`/api/query`, table `curves_quotes`) that could fetch all prices in one call. It is not used yet because its request format isn't documented to us.

## Setup

1. **Vercel**: import this repo at vercel.com/new (framework: Next.js, no build settings needed).
2. In Vercel → Settings → Environment Variables, add:
   - `DASHBOARD_PASSWORD`: protects the whole site. You sign in on a login page; Basic auth (any username) also works for scripts.
   - `GILTSYIELD_API_KEY`: from your giltsyield.com Profile page.
   - `FINNHUB_API_KEY` (optional): free key from finnhub.io, for the earnings calendar.
3. **GitHub secret for the briefing**: add `ANTHROPIC_API_KEY` the same way as below (repo → Settings → Secrets and variables → Actions). To write one straight away: Actions → *Morning briefing* → *Run workflow*.
4. **GitHub secret** (recommended): repo → Settings → Secrets and variables → Actions → *New repository secret*, name `GILTSYIELD_API_KEY`. The daily job then records giltsyield.com closes for every gilt; without it, it records DMO closes.
5. **First data load**: GitHub → Actions → *Update market data* → *Run workflow*. Tick **backfill** for about 3 years of curve history, and set **gilt_days** to backfill per-gilt closes (25 covers the 1-month change; 260 is a year, at roughly 75 giltsyield calls per day backfilled). After that it runs on its own.

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
