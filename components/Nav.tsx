"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "./ThemeToggle";

// Gilts pages live under one dropdown; each asset class has its own tab.
export const GILT_PAGES = [
  { href: "/gilts", label: "Dashboard" },
  { href: "/gilts/bonds", label: "Gilts" },
  { href: "/gilts/curves", label: "Curves" },
  { href: "/gilts/ois", label: "vs OIS" },
  { href: "/gilts/cross-market", label: "Cross-market" },
  { href: "/gilts/rv", label: "Relative value" },
  { href: "/gilts/portfolio", label: "Portfolio" },
];

const MARKET_TABS = [
  { href: "/equities", label: "Equities" },
  { href: "/fx", label: "FX" },
  { href: "/commodities", label: "Commodities" },
  { href: "/economy", label: "Economy" },
];

const isActive = (path: string, href: string) =>
  href === "/" ? path === "/" : href === "/gilts" ? path === "/gilts" : path === href || path.startsWith(`${href}/`);

/** A tab that opens a small menu of pages (desktop: dropdown, mobile: sheet above the tab bar). */
function MenuTab({
  label,
  items,
  active,
  variant,
}: {
  label: string;
  items: { href: string; label: string }[];
  active: boolean;
  variant: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={variant === "top" ? "relative" : "relative flex-1"}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={
          variant === "top"
            ? `whitespace-nowrap border-b-2 px-3 py-3 text-sm ${active ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`
            : `flex w-full flex-col items-center py-2 text-[11px] ${active ? "font-semibold text-accent" : "text-ink-2"}`
        }
      >
        {variant === "bottom" && <span aria-hidden className="text-base leading-5">{label === "Gilts" ? "£" : "◫"}</span>}
        {label} {variant === "top" && <span aria-hidden className="text-xs">▾</span>}
      </button>
      {open && (
        <div
          role="menu"
          className={`card absolute z-40 min-w-44 py-1 shadow-lg ${variant === "top" ? "left-0 top-full mt-1" : "bottom-full left-1/2 mb-2 -translate-x-1/2"}`}
        >
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`block px-4 py-2 text-sm hover:bg-surface-2 ${isActive(path, it.href) ? "font-medium text-accent" : "text-ink"}`}
            >
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function TopLink({ href, label, path }: { href: string; label: string; path: string }) {
  const active = isActive(path, href);
  return (
    <Link
      href={href}
      className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${active ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
    >
      {label}
    </Link>
  );
}

function BottomLink({ href, label, icon, path }: { href: string; label: string; icon: string; path: string }) {
  const active = isActive(path, href);
  return (
    <Link href={href} className={`flex flex-1 flex-col items-center py-2 text-[11px] ${active ? "font-semibold text-accent" : "text-ink-2"}`}>
      <span aria-hidden className="text-base leading-5">{icon}</span>
      {label}
    </Link>
  );
}

export default function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  const inGilts = path === "/gilts" || path.startsWith("/gilts/");
  const inMarkets = MARKET_TABS.some((t) => isActive(path, t.href));

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center gap-1 px-4 sm:px-6">
          <Link href="/" className="mr-4 py-3 text-sm font-semibold whitespace-nowrap text-ink">
            Markets Monitor
          </Link>
          {/* Desktop and tablet tabs */}
          <div className="hidden items-center gap-1 md:flex">
            <TopLink href="/" label="Overview" path={path} />
            <MenuTab label="Gilts" items={GILT_PAGES} active={inGilts} variant="top" />
            {MARKET_TABS.map((t) => (
              <TopLink key={t.href} href={t.href} label={t.label} path={path} />
            ))}
            <TopLink href="/charts" label="Charts" path={path} />
            <TopLink href="/news" label="News" path={path} />
          </div>
          <div className="ml-auto py-2">
            <ThemeToggle />
          </div>
        </nav>
      </header>
      {/* Phone tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Main"
      >
        <BottomLink href="/" label="Overview" icon="◎" path={path} />
        <MenuTab label="Gilts" items={GILT_PAGES} active={inGilts} variant="bottom" />
        <MenuTab label="Markets" items={MARKET_TABS} active={inMarkets} variant="bottom" />
        <BottomLink href="/charts" label="Charts" icon="↗" path={path} />
        <BottomLink href="/news" label="News" icon="≡" path={path} />
      </nav>
    </>
  );
}
