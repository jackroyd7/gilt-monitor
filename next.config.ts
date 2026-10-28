import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read data/*.json from disk at request time; make sure those files ship with the server bundle.
  outputFileTracingIncludes: {
    "/**": ["./data/**/*.json", "./data-demo/**/*.json"],
  },
  // Old addresses from before the gilt pages moved under /gilts, so bookmarks keep working.
  async redirects() {
    return [
      { source: "/curves", destination: "/gilts/curves", permanent: true },
      { source: "/swaps", destination: "/gilts/ois", permanent: true },
      { source: "/cross-market", destination: "/gilts/cross-market", permanent: true },
      { source: "/portfolio", destination: "/gilts/portfolio", permanent: true },
      { source: "/markets/chart", destination: "/charts", permanent: true },
      { source: "/markets", destination: "/equities", permanent: true },
    ];
  },
};

export default nextConfig;
