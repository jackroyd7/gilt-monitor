import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read data/*.json from disk at request time; make sure those files ship with the server bundle.
  outputFileTracingIncludes: {
    "/**": ["./data/**/*.json", "./data-demo/**/*.json"],
  },
};

export default nextConfig;
