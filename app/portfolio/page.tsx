import Link from "next/link";
import { connection } from "next/server";
import { MonthlyBars } from "@/components/charts";
import GiltTable from "@/components/GiltTable";
import { Card, PageHeader } from "@/components/Tiles";
import { giltRows } from "@/lib/analytics";
import LiveBar from "@/components/LiveBar";
import { loadMarketWithLive } from "@/lib/data";
import { liveInfo } from "@/lib/live";
import { findKey, giltsYield, giltsYieldConfigured, portfolioRef, type Row } from "@/lib/giltsyield";

const numOf = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[£,%\s]/g, ""));
  return isFinite(n) ? n : null;
};

function DataTable({ rows, max = 200 }: { rows: Row[]; max?: number }) {
  if (!rows.length) return <p className="text-sm text-muted">Nothing returned.</p>;
  const keys = Object.keys(rows[0]).filter((k) => rows.some((r) => r[k] != null && typeof r[k] !== "object"));
  return (
    <div className="overflow-x-auto">
      <table className="num w-full text-xs">
        <thead>
          <tr className="text-muted">
            {keys.map((k) => (
              <th key={k} className="py-1.5 pr-3 text-left font-normal whitespace-nowrap">{k.replace(/_/g, " ")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, max).map((r, i) => (
            <tr key={i} className="border-t border-line text-ink-2">
              {keys.map((k) => (
                <td key={k} className="py-1.5 pr-3 whitespace-nowrap">{r[k] == null ? "" : String(r[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > max && <p className="mt-2 text-xs text-muted">Showing {max} of {rows.length} rows.</p>}
    </div>
  );
}

function monthlyFlows(rows: Row[]) {
  const dateKey = findKey(rows, /^date$/i, /pay.*date/i, /date/i);
  const amtKey = findKey(rows, /^total$/i, /^amount$/i, /amount/i, /cash/i, /value/i);
  if (!dateKey || !amtKey) return [];
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    const d = String(r[dateKey] ?? "").slice(0, 7);
    const a = numOf(r[amtKey]);
    if (/^\d{4}-\d{2}$/.test(d) && a != null) byMonth.set(d, (byMonth.get(d) ?? 0) + a);
  }
  return [...byMonth.entries()].sort().slice(0, 36).map(([month, amount]) => ({ month, amount }));
}

async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export default async function PortfolioPage({ searchParams }: PageProps<"/portfolio">) {
  await connection(); // read the API key at request time, never at build time

  if (!giltsYieldConfigured()) {
    return (
      <>
        <PageHeader title="Portfolio">Connect your giltsyield.com account to see your holdings here.</PageHeader>
        <Card title="Setup">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
            <li>Log in to giltsyield.com, open your Profile and copy your API key.</li>
            <li>
              In Vercel → Project → Settings → Environment Variables, add <code>GILTSYIELD_API_KEY</code>. Locally,
              put it in <code>.env.local</code>.
            </li>
            <li>Redeploy. The key stays on the server and is never written to the repository.</li>
          </ol>
        </Card>
      </>
    );
  }

  const list = await settle(giltsYield.portfolios());
  if (!list.ok) {
    return (
      <>
        <PageHeader title="Portfolio" />
        <Card title="Couldn’t reach giltsyield.com">
          <p className="text-sm text-ink-2">{list.error}</p>
        </Card>
      </>
    );
  }
  const portfolios = list.value.map(portfolioRef).filter((p) => p.id);
  const { p } = await searchParams;
  const selected = portfolios.find((x) => x.id === p) ?? portfolios[0];

  if (!selected) {
    return <PageHeader title="Portfolio">No portfolios found on your giltsyield.com account.</PageHeader>;
  }

  const [pl, book, flows, market] = await Promise.all([
    settle(giltsYield.pl(selected.id)),
    settle(giltsYield.bookYield(selected.id)),
    settle(giltsYield.upcomingFlows(selected.id)),
    loadMarketWithLive(),
  ]);

  // Join holdings to market analytics by ISIN.
  const { rows: gilts } = giltRows(market.gilts, market.curves);
  const holdings = book.ok ? book.value : [];
  const isinKey = findKey(holdings, /isin/i);
  const nomKey = findKey(holdings, /nominal/i, /holding/i, /quantity/i, /units/i);
  const held = new Map(
    holdings.map((h) => [String(h[isinKey ?? ""] ?? "").trim(), nomKey ? numOf(h[nomKey]) : null] as const),
  );
  const heldRows = gilts
    .filter((g) => held.has(g.isin))
    .map((g) => ({ ...g, held: held.get(g.isin)?.toLocaleString("en-GB") ?? "✓" }));

  return (
    <>
      <PageHeader title={`Portfolio · ${selected.name}`}>
        Holdings from giltsyield.com each time you load the page. Prices are intraday where available; curves and OIS are the latest BoE daily data.
      </PageHeader>
      {portfolios.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5 text-xs">
          {portfolios.map((x) => (
            <Link
              key={x.id}
              href={`/portfolio?p=${encodeURIComponent(x.id)}`}
              className={`rounded-full border border-line px-2.5 py-0.5 ${x.id === selected.id ? "bg-surface-2 text-ink" : "text-ink-2"}`}
            >
              {x.name}
            </Link>
          ))}
        </div>
      )}
      <LiveBar live={liveInfo(market.live)} />
      <div className="grid gap-4">
        <Card title="Holdings against the market" subtitle={isinKey ? "Your gilts, with today’s yield, curve and OIS spreads" : "Couldn’t find an ISIN column in the book-yield response to join on"}>
          {heldRows.length ? <GiltTable rows={heldRows} showHeld /> : <p className="text-sm text-muted">No holdings matched to DMO gilts.</p>}
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Upcoming cash flows" subtitle="Coupons and redemptions by month">
            {flows.ok ? <MonthlyBars data={monthlyFlows(flows.value)} /> : <p className="text-sm text-muted">{flows.error}</p>}
          </Card>
          <Card title="Profit and loss">
            {pl.ok ? <DataTable rows={pl.value} max={50} /> : <p className="text-sm text-muted">{pl.error}</p>}
          </Card>
        </div>
        <Card title="Book yield by position">
          {book.ok ? <DataTable rows={book.value} /> : <p className="text-sm text-muted">{book.error}</p>}
        </Card>
      </div>
    </>
  );
}
