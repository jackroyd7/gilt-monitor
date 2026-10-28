import type { Metadata, Viewport } from "next";
import AskBox from "@/components/AskBox";
import Nav from "@/components/Nav";
import SourceStatus, { DemoBanner } from "@/components/SourceStatus";
import { themeBootScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Markets Monitor",
  description: "UK gilts, curves, OIS and cross-market spreads, plus equities, FX, commodities and news.",
  appleWebApp: { capable: true, title: "Markets", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  viewportFit: "cover", // let the phone tab bar sit behind the home indicator
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfb" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a19" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <DemoBanner />
          <AskBox />
          {children}
        </main>
        <footer className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:pb-8">
          <SourceStatus />
        </footer>
      </body>
    </html>
  );
}
