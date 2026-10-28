"use client";

import { useEffect, useState } from "react";
import { THEME_KEY } from "@/lib/theme";

// Light / dark / follow the device. The choice is a per-browser preference applied as
// data-theme on <html>; the inline script in the layout applies it before first paint.
type Theme = "system" | "light" | "dark";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "Auto", light: "Light", dark: "Dark" };
const ICON: Record<Theme, string> = { system: "◐", light: "☀", dark: "☾" };

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as Theme | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off read of a saved preference
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, []);

  const cycle = () => {
    const next = NEXT[theme];
    setTheme(next);
    applyTheme(next);
    try {
      if (next === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {}
  };

  return (
    <button
      onClick={cycle}
      title={`Theme: ${LABEL[theme]} (click to change)`}
      aria-label={`Theme: ${LABEL[theme]}`}
      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:text-ink"
    >
      <span aria-hidden>{ICON[theme]}</span>
      <span className="hidden sm:inline lg:hidden xl:inline">{LABEL[theme]}</span>
    </button>
  );
}
