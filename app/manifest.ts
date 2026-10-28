import type { MetadataRoute } from "next";

/** Lets the site be added to the iPhone / Android home screen and open full-screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Markets Monitor",
    short_name: "Markets",
    description: "Gilts, rates, equities, FX, commodities and news",
    start_url: "/",
    display: "standalone",
    background_color: "#05091a",
    theme_color: "#052460",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
