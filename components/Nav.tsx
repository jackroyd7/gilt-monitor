"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/curves", label: "Curves" },
  { href: "/gilts", label: "Gilts" },
  { href: "/swaps", label: "vs OIS" },
  { href: "/cross-market", label: "Cross-market" },
  { href: "/portfolio", label: "Portfolio" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-line bg-surface">
      <nav className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 sm:px-6">
        <span className="mr-4 py-3 text-sm font-semibold whitespace-nowrap">Gilt Monitor</span>
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${
                active ? "border-accent text-ink font-medium" : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
