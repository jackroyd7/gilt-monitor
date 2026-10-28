import type { MetadataRoute } from "next";

/** Lets the site be added to the iPhone / Android home screen and open full-screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Markets Monitor",
    short_name: "Markets",
    description: "Gilts, rates, equities, FX, commodities and news",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0d0d",
    theme_color: "#0d366b",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
