import { redirect } from "next/navigation";

/** Old chart links now open the chart popup on the Markets page. */
export default async function MarketChartRedirect({ searchParams }: PageProps<"/markets/chart">) {
  const params = await searchParams;
  const raw = params.tvwidgetsymbol ?? params.symbol;
  const symbol = Array.isArray(raw) ? raw[0] : raw;
  redirect(symbol ? `/markets?tvwidgetsymbol=${encodeURIComponent(symbol)}` : "/markets");
}
