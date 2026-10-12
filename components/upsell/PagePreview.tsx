"use client";

import { Maximize, Monitor, Smartphone, Tablet, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* ==========================================================================
   A page rendered live at a real device width, scaled to fit its frame.

   The iframe is laid out at 1280 / 820 / 390 CSS pixels — what the page would
   actually get on that device, so its own breakpoints fire — and shrunk with a
   transform to the width it has. Sandboxed the same way the route's CSP
   header sandboxes it, so opening the src in a tab changes nothing.
   ========================================================================== */

export type Device = "desktop" | "tablet" | "mobile";

export const DEVICES: { id: Device; label: string; width: number; Icon: typeof Monitor }[] = [
  { id: "desktop", label: "Desktop", width: 1280, Icon: Monitor },
  { id: "tablet", label: "Tablet", width: 820, Icon: Tablet },
  { id: "mobile", label: "Mobile", width: 390, Icon: Smartphone },
];

/* useLayoutEffect warns on the server; the measurement only matters in a browser. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function DeviceToggle({
  value,
  onChange,
  tone = "dark",
}: {
  value: Device;
  onChange: (d: Device) => void;
  tone?: "dark" | "overlay";
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Preview size"
      className={`flex items-center gap-0.5 rounded-pf-md border p-0.5 ${
        tone === "overlay" ? "border-white/15 bg-black/40" : "border-pf-border bg-pf-bg-deep"
      }`}
    >
      {DEVICES.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          aria-label={label}
          title={label}
          onClick={() => onChange(id)}
          className={`flex h-8 items-center gap-1.5 rounded-[9px] px-2.5 text-[12.5px] font-semibold transition-colors ${
            value === id ? "bg-pf-card-hi text-pf-text" : "text-pf-faint hover:text-pf-body"
          }`}
        >
          <Icon size={14} strokeWidth={1.75} aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

/** The scaled frame. `height` is the visible height in screen pixels. */
export function ScaledFrame({
  src,
  title,
  device,
  height,
  className = "",
}: {
  src: string;
  title: string;
  device: Device;
  height: number | "fill";
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const width = DEVICES.find((d) => d.id === device)!.width;

  useIsoLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = size.w > 0 ? Math.min(1, size.w / width) : 0;
  const visibleH = height === "fill" ? size.h : height;
  const frameH = scale > 0 ? Math.ceil(visibleH / scale) : visibleH;
  const offset = scale > 0 ? Math.max(0, (size.w - width * scale) / 2) : 0;

  return (
    <div
      ref={box}
      className={`relative overflow-hidden bg-white ${className}`}
      style={height === "fill" ? undefined : { height }}
    >
      {scale > 0 && (
        <iframe
          src={src}
          title={title}
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute left-0 top-0 origin-top-left border-0 bg-white"
          style={{ width, height: frameH, transform: `translateX(${offset}px) scale(${scale})` }}
        />
      )}
    </div>
  );
}

/** Full-screen overlay with its own device toggle. Escape closes it. */
export function FullscreenPreview({
  src,
  title,
  device,
  onDevice,
  onClose,
}: {
  src: string;
  title: string;
  device: Device;
  onDevice: (d: Device) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} className="pfd-root fixed inset-0 z-[100] flex flex-col bg-[rgba(7,4,17,0.96)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <p className="min-w-0 truncate font-display text-[15px] font-semibold text-pf-text">{title}</p>
        <div className="flex items-center gap-2">
          <DeviceToggle value={device} onChange={onDevice} tone="overlay" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="grid size-9 place-items-center rounded-pf-md border border-white/15 text-pf-body hover:bg-white/10"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 px-2 pb-2 sm:px-6 sm:pb-6">
        <ScaledFrame src={src} title={title} device={device} height="fill" className="h-full rounded-pf-md" />
      </div>
    </div>,
    document.body,
  );
}

export function FullscreenButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open full screen"
      title="Full screen"
      className="grid size-9 place-items-center rounded-pf-md border border-pf-border text-pf-body transition-colors hover:border-pf-border-hi hover:bg-pf-card"
    >
      <Maximize size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
