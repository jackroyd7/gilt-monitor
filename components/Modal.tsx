"use client";

import { useEffect, useRef } from "react";

/** Centred popup over a dimmed page. Closes on Esc, the ✕ button, or a click outside. */
export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`card flex max-h-full w-full flex-col shadow-2xl outline-none ${wide ? "max-w-6xl" : "max-w-3xl"}`}
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-ink-2 hover:bg-surface-2 hover:text-ink">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>
  );
}
