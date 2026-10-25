"use client";

import { useState } from "react";

// Copy or download the enclosing card (title, legend and chart) as a PNG. The image is
// rendered from the live DOM with html-to-image, so it matches what's on screen.

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "chart";

async function renderCard(button: HTMLElement): Promise<{ blob: Blob; name: string }> {
  const card = button.closest<HTMLElement>("[data-export-card]");
  if (!card) throw new Error("nothing to export");
  const { toBlob } = await import("html-to-image");
  const bg = getComputedStyle(document.body).getPropertyValue("--surface").trim() || "#ffffff";
  const blob = await toBlob(card, {
    pixelRatio: 2,
    backgroundColor: bg,
    // Leave out the export buttons themselves and anything marked as screen-only.
    filter: (node) => !(node instanceof HTMLElement && node.dataset.exportIgnore != null),
  });
  if (!blob) throw new Error("couldn't render the image");
  const title = card.querySelector("h2")?.textContent ?? "chart";
  return { blob, name: `${slug(title)}-${new Date().toISOString().slice(0, 10)}.png` };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function ExportButtons() {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "saved" | "error">("idle");
  const flash = (s: typeof state) => {
    setState(s);
    setTimeout(() => setState("idle"), 1800);
  };

  const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    setState("busy");
    try {
      // Safari needs the ClipboardItem created synchronously with a promise for the data.
      const rendered = renderCard(button);
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": rendered.then((r) => r.blob) })]);
        flash("copied");
      } else {
        const { blob, name } = await rendered;
        download(blob, name);
        flash("saved");
      }
    } catch {
      flash("error");
    }
  };

  const save = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    setState("busy");
    try {
      const { blob, name } = await renderCard(button);
      download(blob, name);
      flash("saved");
    } catch {
      flash("error");
    }
  };

  const label = { idle: "", busy: "…", copied: "Copied", saved: "Saved", error: "Failed" }[state];
  const btn = "rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50";
  return (
    <span data-export-ignore className="inline-flex shrink-0 items-center gap-1">
      {label && <span className="text-[11px] text-muted" aria-live="polite">{label}</span>}
      <button onClick={copy} disabled={state === "busy"} className={btn} title="Copy chart as an image">
        Copy image
      </button>
      <button onClick={save} disabled={state === "busy"} className={btn} title="Download chart as PNG">
        Save PNG
      </button>
    </span>
  );
}
