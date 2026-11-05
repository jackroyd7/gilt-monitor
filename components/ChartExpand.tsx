"use client";

import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Modal, { FullScreenContext } from "./Modal";

/** Whether a phone is held upright (to suggest turning it for a wider chart). */
function usePortraitPhone() {
  const [p, setP] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(
      "(orientation: portrait) and (max-width: 640px)",
    );
    const on = () => setP(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return p;
}

/** Small ⤢ button that opens a chart full screen. */
export function ExpandButton({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  if (useContext(FullScreenContext)) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Expand chart"
      aria-label="Expand chart"
      data-export-ignore
      className={`rounded-md border border-line px-1.5 py-0.5 text-xs leading-none text-ink-2 hover:text-ink ${className}`}
    >
      ⤢
    </button>
  );
}

/**
 * A chart drawn full screen: `render` gets the height to fill. On a phone it takes the
 * whole screen, so turning it sideways gives a wide chart. The height starts from the
 * space in the pop-up less a guess for the chart's own controls, then is trimmed by any
 * overflow so the whole chart (axis included) fits; it's worked out again on rotation.
 */
export function ExpandedChart({
  title,
  onClose,
  render,
  reserve = 60,
}: {
  title: React.ReactNode;
  onClose: () => void;
  render: (height: number) => React.ReactNode;
  /** First guess at the space the chart's own controls and legend take, px. */
  reserve?: number;
}) {
  const portrait = usePortraitPhone();
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [size, setSize] = useState(0);

  // The pop-up body is the scroll container around our box.
  useEffect(() => {
    const body = box.current?.parentElement;
    if (!body) return;
    const ro = new ResizeObserver(() =>
      setSize(body.clientHeight + body.clientWidth / 1e6),
    );
    ro.observe(body);
    return () => ro.disconnect();
  }, []);
  // Fit: whatever the box holds besides the chart (legend, controls) plus the chart must
  // equal the space in the pop-up. Re-run when the chart height or the pop-up size changes.
  useLayoutEffect(() => {
    const body = box.current?.parentElement;
    if (!body || !box.current) return;
    const style = getComputedStyle(body);
    const room =
      body.clientHeight -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom);
    const others = height == null ? reserve : box.current.offsetHeight - height;
    const want = Math.max(160, Math.floor(room - others - 2));
    if (height == null || Math.abs(want - height) > 2) setHeight(want);
  }, [height, size, reserve]);

  return (
    <Modal
      size="full"
      title={<span className="line-clamp-1">{title}</span>}
      subtitle={
        portrait ? "Turn your phone sideways for a wider chart" : undefined
      }
      onClose={onClose}
    >
      <div ref={box} className="px-1 sm:px-2">
        {height != null && render(height)}
      </div>
    </Modal>
  );
}
