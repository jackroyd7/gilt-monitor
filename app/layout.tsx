import type { Metadata } from "next";
import Nav from "@/components/Nav";
import SourceStatus, { DemoBanner } from "@/components/SourceStatus";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gilt Monitor",
  description: "UK gilt curves, spreads, cross-market and SONIA OIS comparison, plus your giltsyield.com portfolio.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <DemoBanner />
          {children}
        </main>
        <footer className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
          <SourceStatus />
        </footer>
      </body>
    </html>
  );
}
