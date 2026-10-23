// Topics for the News tab. Each topic pulls Google News searches (and optional RSS feeds),
// tags the articles it finds, and shows up as a filter chip. Edit freely: queries use Google
// News search syntax (OR, quotes, minus to exclude).

export interface NewsTopic {
  id: string;
  label: string;
  /** Google News search queries; results from the last week are used. */
  queries: string[];
  /** Extra RSS/Atom feeds to include under this topic. */
  feeds?: string[];
}

export const NEWS_TOPICS: NewsTopic[] = [
  { id: "gilts", label: "Gilts & DMO", queries: ['gilts OR "gilt yields" OR "gilt market"', '"Debt Management Office" OR "gilt auction" OR "gilt syndication"'] },
  {
    id: "boe",
    label: "Bank of England",
    queries: ['"Bank of England" (rates OR MPC OR Bailey OR inflation)'],
    feeds: ["https://www.bankofengland.co.uk/rss/news"],
  },
  { id: "ukdata", label: "UK inflation & data", queries: ['UK (inflation OR CPI OR RPI OR wages OR unemployment OR GDP) ONS'] },
  { id: "fiscal", label: "UK fiscal", queries: ['UK (Chancellor OR budget OR "fiscal rules" OR OBR OR borrowing)'] },
  { id: "global", label: "Global bonds & central banks", queries: ['"Treasury yields" OR "Bund yields" OR "bond market"', '(Fed OR ECB OR "Federal Reserve") interest rates'] },
  { id: "fx", label: "Sterling & FX", queries: ['sterling OR "pound" (dollar OR euro) currency'] },
  { id: "commodities", label: "Oil, gas & metals", queries: ['"oil prices" OR Brent OR "gas prices" OR OPEC', '"gold price" OR copper OR "commodity prices"'] },
  { id: "equities", label: "Equities", queries: ['"FTSE 100" OR "FTSE 250"', '"stock market" OR "Wall Street" OR "S&P 500"'] },
];

/** Words that make an article rank higher under "Most relevant". */
export const PRIORITY_WORDS = [
  "gilt", "gilts", "index-linked", "linker", "sonia", "mpc", "bank of england", "obr", "dmo",
  "auction", "syndication", "rpi", "cpi", "yields", "budget", "fiscal", "sterling",
];

/** Articles whose title contains any of these are hidden (you can add more on the page). */
export const MUTED_WORDS: string[] = [];
