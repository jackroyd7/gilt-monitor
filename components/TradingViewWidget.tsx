"use client";

import { useEffect, useRef, useState } from "react";

// Embeds one of TradingView's free widgets (https://www.tradingview.com/widget-docs/).
// The widget script reads its JSON config from the script tag's body, so we build the
// tag by hand. It follows the page's light/dark theme and rebuilds when that changes.

function useDarkMode() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => {
      const forced = document.documentElement.dataset.theme;
      setDark(forced ? forced === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
    };
    read();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    // The theme switch changes data-theme on <html>; follow it.
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", read);
      obs.disconnect();
    };
  }, []);
  return dark;
}

export default function TradingViewWidget({
  widget,
  config,
  height,
  chartPath,
  lazy,
}: {
  /** Script name after "embed-widget-", e.g. "ticker-tape", "market-quotes", "advanced-chart". */
  widget: string;
  config: Record<string, unknown>;
  height: number | string;
  /**
   * A page on this site that clicks on a symbol should open, instead of tradingview.com.
   * TradingView appends ?tvwidgetsymbol=EXCHANGE:TICKER to it.
   */
  chartPath?: string;
  /** Load only when scrolled near (for pages with many widgets). */
  lazy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dark = useDarkMode();
  const configJson = JSON.stringify(config);
  const [visible, setVisible] = useState(!lazy);

  useEffect(() => {
    if (visible || !ref.current) return;
    const obs = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "300px" });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [visible]);

  useEffect(() => {
    const host = ref.current;
    if (!host || !visible) return;
    host.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const script = document.createElement("script");
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${widget}.js`;
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      ...JSON.parse(configJson),
      colorTheme: dark ? "dark" : "light",
      theme: dark ? "dark" : "light",
      isTransparent: true,
      locale: "en",
      // The widget runs in TradingView's iframe, so the link must be absolute.
      // (the heatmap calls the same setting symbolUrl)
      ...(chartPath ? { largeChartUrl: `${window.location.origin}${chartPath}`, symbolUrl: `${window.location.origin}${chartPath}` } : {}),
    });
    host.appendChild(script);
    return () => {
      host.innerHTML = "";
    };
  }, [widget, configJson, dark, chartPath, visible]);

  return <div ref={ref} className="tradingview-widget-container w-full" style={{ height }} />;
}
