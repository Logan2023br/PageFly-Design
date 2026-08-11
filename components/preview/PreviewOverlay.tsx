"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DEVICES, type DeviceId, type PageMockup } from "@/lib/generate/types";
import { useStore } from "@/lib/store";
import { MockupPage } from "../mockup/MockupPage";
import { Button, Icon, Tag } from "../ui";
import { useExport } from "../results/ExportProvider";
import { DeviceFrame } from "./DeviceFrame";

/* ==========================================================================
   The preview overlay.

   Switching device genuinely re-lays out the mockup at that breakpoint — the
   frame springs to the new size and the blocks reflow. It is never a scaled
   picture of the desktop render.

   No code, markup or "view source" affordance appears anywhere in here.
   ========================================================================== */

const DEVICE_ICON: Record<DeviceId, "Monitor" | "Laptop" | "Tablet" | "Smartphone"> =
  {
    desktop: "Monitor",
    laptop: "Laptop",
    tablet: "Tablet",
    mobile: "Smartphone",
  };

const SHORTCUTS = [
  ["Esc", "Close"],
  ["← →", "Previous / next page"],
  ["1 – 4", "Device size"],
  ["+ −", "Zoom"],
  ["0", "Fit"],
] as const;

type Spec = (typeof DEVICES)[number];

/* ==========================================================================
   Viewport — the scrolling page inside the device frame.

   Mounted with a key of page + variant + device so scroll position and scroll
   progress reset by remounting rather than by writing state from an effect.
   ========================================================================== */

function Viewport({
  page,
  spec,
  device,
  scrub,
}: {
  page: PageMockup;
  spec: Spec;
  device: DeviceId;
  scrub: boolean;
}) {
  const nudgeZoom = useStore((s) => s.nudgeZoom);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    setProgress(max <= 0 ? 0 : el.scrollTop / max);
  }, []);

  /* Hover-scrub: vertical mouse position maps straight to scroll position, for
     scanning a long page fast. */
  const onScrubMove = (e: React.MouseEvent) => {
    if (!scrub) return;
    const el = scrollRef.current;
    const box = e.currentTarget.getBoundingClientRect();
    if (!el || box.height === 0) return;
    const t = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    el.scrollTop = t * (el.scrollHeight - el.clientHeight);
  };

  /* Pinch to zoom on touch. */
  const pinch = useRef<number | null>(null);
  const spread = (e: React.TouchEvent) =>
    Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );

  return (
    <DeviceFrame
      device={device}
      width={spec.width}
      height={spec.height}
      brandLabel={`${page.label.toLowerCase().replace(/[^a-z]+/g, "-")} · ${spec.width}px`}
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onMouseMove={onScrubMove}
        onTouchStart={(e) => {
          if (e.touches.length === 2) pinch.current = spread(e);
        }}
        onTouchMove={(e) => {
          if (e.touches.length !== 2 || pinch.current === null) return;
          const d = spread(e);
          const delta = (d - pinch.current) / 320;
          if (Math.abs(delta) > 0.01) {
            nudgeZoom(delta);
            pinch.current = d;
          }
        }}
        onTouchEnd={() => {
          pinch.current = null;
        }}
        className={`pfd-scroll-none size-full overflow-y-auto overflow-x-hidden ${
          scrub ? "cursor-ns-resize" : ""
        }`}
      >
        <MockupPage page={page} width={spec.width} />
      </div>

      {/* Scroll rail, on the frame's right edge. */}
      <div className="pointer-events-none absolute inset-y-2 right-1.5 w-[3px] overflow-hidden rounded-full bg-black/15">
        <div
          className="w-full rounded-full bg-white/45"
          style={{ height: "18%", transform: `translateY(${progress * 455}%)` }}
        />
      </div>
    </DeviceFrame>
  );
}

/* ========================================================================== */

export function PreviewOverlay({
  pages,
  index,
}: {
  pages: PageMockup[];
  index: number;
}) {
  const page = pages[index];
  const device = useStore((s) => s.device);
  const prevDeviceWidth = useStore((s) => s.prevDeviceWidth);
  const zoom = useStore((s) => s.zoom);
  const setDevice = useStore((s) => s.setDevice);
  const setZoom = useStore((s) => s.setZoom);
  const nudgeZoom = useStore((s) => s.nudgeZoom);
  const close = useStore((s) => s.closePreview);
  const step = useStore((s) => s.stepPreview);
  const regenerateOne = useStore((s) => s.regenerateOne);
  const hasSeenShortcuts = useStore((s) => s.hasSeenShortcuts);
  const markShortcutsSeen = useStore((s) => s.markShortcutsSeen);
  const { exportOne, exporting } = useExport();

  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [scrub, setScrub] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(!hasSeenShortcuts);

  const spec = DEVICES.find((d) => d.id === device) ?? DEVICES[0];

  /* ---- body scroll lock ------------------------------------------------ */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /* ---- measure the available stage ------------------------------------- */
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chromeW = device === "mobile" ? 22 : device === "tablet" ? 28 : 0;
  const chromeH =
    device === "mobile" ? 58 : device === "tablet" ? 44 : 38;

  /* Breathing room between the frame and the edges of the stage.

     Was 8px — four each side, which put the top of the device frame four pixels
     under a translucent glass toolbar. You could read the mockup through the
     toolbar, which looks exactly like the header sitting on top of the page
     rather than above it. 32px is enough that the frame reads as a separate
     object. */
  const GUTTER = 32;

  const fitScale = Math.min(
    1,
    stage.w > 0 ? (stage.w - GUTTER) / (spec.width + chromeW) : 1,
    stage.h > 0 ? (stage.h - GUTTER) / (spec.height + chromeH) : 1,
  );
  const scale = zoom ?? fitScale;

  /* ---- keyboard -------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          close();
          break;
        case "ArrowLeft":
          e.preventDefault();
          step(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          step(1);
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          e.preventDefault();
          setDevice(DEVICES[Number(e.key) - 1].id);
          break;
        case "+":
        case "=":
          e.preventDefault();
          nudgeZoom(0.1);
          break;
        case "-":
        case "_":
          e.preventDefault();
          nudgeZoom(-0.1);
          break;
        case "0":
          e.preventDefault();
          setZoom(null);
          break;
        case "?":
          e.preventDefault();
          setShowShortcuts((v) => !v);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, step, setDevice, setZoom, nudgeZoom]);

  /* The hint shows once per session, then gets out of the way. */
  useEffect(() => {
    if (hasSeenShortcuts) return;
    markShortcutsSeen();
    const t = setTimeout(() => setShowShortcuts(false), 6000);
    return () => clearTimeout(t);
  }, [hasSeenShortcuts, markShortcutsSeen]);

  if (!page) return null;

  const spring = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 260, damping: 30 };

  return (
    <motion.div
      /* touch-action: iOS otherwise holds every tap for ~300ms waiting to see
         if it is a double-tap to zoom, which on a row of small controls reads
         as taps being dropped. */
      className="fixed inset-0 z-50 flex flex-col [touch-action:manipulation]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label={`${page.label} preview`}
    >
      {/* Backdrop.

          Was a <button> the size of the screen carrying its own
          backdrop-filter, sitting as a previous sibling of a toolbar that also
          has one. On iOS Safari a backdrop-filter element makes its own
          compositing layer and does not reliably respect z-index against
          another one — which is the shape of "every control in the toolbar
          stopped responding on a phone and nowhere else".

          A plain div at an explicit z-0, with no filter of its own, has nothing
          to fight the toolbar over. It is also not a screen-sized button, which
          a screen reader announced as one enormous control. */}
      <div
        aria-hidden="true"
        onClick={close}
        className="absolute inset-0 z-0 bg-pf-bg-deep/88"
      />

      {/* ---- toolbar ---- */}
      <div className="pfd-glass relative z-20 border-b border-pf-border">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="min-w-0 truncate text-[14px] font-semibold text-pf-text">
              {page.label}
              {page.copyTotal && page.copyTotal > 1 && (
                <span className="font-normal text-pf-faint"> {page.copyIndex}</span>
              )}
            </span>
            <Tag>{page.categoryLabel}</Tag>
            <span className="shrink-0 text-[12.5px] tabular-nums text-pf-muted">
              {index + 1} / {pages.length}
            </span>

            {/* Page stepping, for screens with no keyboard.

                The arrows either side of the stage are hidden below `sm` —
                correctly, since two 40px buttons on a 390px screen would take a
                quarter of the width away from the mockup. But nothing replaced
                them, so on a phone a twelve-page deck had no way to reach page
                two: the only route was the ← → keys, which is exactly what the
                shortcuts panel was advertising to a device that has none.

                Here rather than beside the stage so they cost no mockup width,
                and next to the counter they act on. */}
            <div className="ml-1 flex shrink-0 items-center gap-1 sm:hidden">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous page"
                className="grid size-9 place-items-center rounded-full border border-pf-border bg-pf-card text-pf-body"
              >
                <Icon name="ChevronLeft" size={16} />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next page"
                className="grid size-9 place-items-center rounded-full border border-pf-border bg-pf-card text-pf-body"
              >
                <Icon name="ChevronRight" size={16} />
              </button>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Device size"
              className="flex items-center gap-0.5 rounded-pf-pill border border-pf-border p-1"
            >
              {DEVICES.map((d, i) => {
                const on = d.id === device;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDevice(d.id)}
                    aria-pressed={on}
                    title={`${d.label} · ${d.width}px · key ${i + 1}`}
                    className={`relative flex items-center gap-1.5 rounded-pf-pill px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                      on ? "text-white" : "text-pf-muted hover:text-pf-body"
                    }`}
                  >
                    {on && (
                      <motion.span
                        layoutId="pfd-device-pill"
                        className="absolute inset-0 rounded-pf-pill bg-pf-primary"
                        transition={spring}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      <Icon name={DEVICE_ICON[d.id]} size={13} />
                      <span className="hidden sm:inline">{d.width}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 rounded-pf-pill border border-pf-border px-2 py-1">
              <button
                type="button"
                onClick={() => nudgeZoom(-0.1)}
                aria-label="Zoom out"
                className="grid size-6 place-items-center rounded-full text-pf-muted hover:bg-pf-card hover:text-pf-text"
              >
                <Icon name="ZoomOut" size={13} />
              </button>
              <input
                type="range"
                min={50}
                max={200}
                step={5}
                value={Math.round(scale * 100)}
                onChange={(e) => setZoom(Number(e.target.value) / 100)}
                aria-label="Zoom level"
                className="h-1 w-[68px] cursor-pointer accent-pf-primary"
              />
              <button
                type="button"
                onClick={() => nudgeZoom(0.1)}
                aria-label="Zoom in"
                className="grid size-6 place-items-center rounded-full text-pf-muted hover:bg-pf-card hover:text-pf-text"
              >
                <Icon name="ZoomIn" size={13} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(null)}
                aria-pressed={zoom === null}
                className={`rounded-pf-sm px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums ${
                  zoom === null
                    ? "text-pf-primary-hi"
                    : "text-pf-muted hover:text-pf-body"
                }`}
              >
                {zoom === null ? "Fit" : `${Math.round(scale * 100)}%`}
              </button>
            </div>

            <Button
              size="sm"
              variant={scrub ? "primary" : "ghost"}
              icon="Crosshair"
              aria-pressed={scrub}
              onClick={() => setScrub((v) => !v)}
              title="Map mouse position to scroll position"
            >
              <span className="hidden lg:inline">Scrub</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              icon="RotateCcw"
              onClick={() => regenerateOne(page.id)}
              title="Build a different version of this page"
            >
              <span className="hidden lg:inline">Regenerate</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              icon="Download"
              disabled={exporting}
              onClick={() => void exportOne(page)}
            >
              <span className="hidden lg:inline">
                {exporting ? "Exporting" : "PNG"}
              </span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowShortcuts((v) => !v)}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              <Icon name="Keyboard" size={14} />
            </Button>

            <button
              type="button"
              onClick={close}
              aria-label="Close preview"
              className="grid size-9 place-items-center rounded-pf-md border border-pf-border text-pf-body transition-colors hover:border-pf-border-hi hover:bg-pf-card"
            >
              <Icon name="X" size={17} />
            </button>
          </div>
        </div>
      </div>

      {/* ---- stage ---- */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center gap-2 px-2 py-4 sm:px-4 sm:py-6">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous page"
          className="hidden size-10 shrink-0 place-items-center rounded-full border border-pf-border bg-pf-card text-pf-body transition-colors hover:border-pf-border-hi hover:bg-pf-card-hi sm:grid"
        >
          <Icon name="ChevronLeft" size={18} />
        </button>

        <div
          ref={stageRef}
          className="grid min-h-0 flex-1 place-items-center overflow-hidden"
        >
          {/* Zoom is a plain CSS transform on the outside. Inside it, the frame
              springs from the ratio of the device we came from to 1 — so a
              1440 → 390 switch visibly shrinks instead of hard-cutting, while
              the mockup itself is laid out at its true width the entire time.

              Deliberately NOT a Framer `layout` animation: layout projection
              around the whole mockup subtree is what distorted the result
              cards, and mixing it with a `scale` style on the same element
              fights over the transform. */}
          <div
            style={{ transform: `scale(${scale})` }}
            className="origin-center"
          >
            <motion.div
              key={device}
              initial={
                reduced ? false : { scale: prevDeviceWidth / spec.width }
              }
              animate={{ scale: 1 }}
              transition={spring}
              className="origin-center"
            >
              <Viewport
                key={`${page.id}-${page.variant}-${device}`}
                page={page}
                spec={spec}
                device={device}
                scrub={scrub}
              />
            </motion.div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next page"
          className="hidden size-10 shrink-0 place-items-center rounded-full border border-pf-border bg-pf-card text-pf-body transition-colors hover:border-pf-border-hi hover:bg-pf-card-hi sm:grid"
        >
          <Icon name="ChevronRight" size={18} />
        </button>
      </div>

      <div className="relative z-10 flex items-center justify-center gap-3 pb-3 text-[11.5px] text-pf-faint">
        <span>
          {spec.label} · {spec.width} × {spec.height}
        </span>
        <span className="hidden sm:inline">
          {scrub
            ? "Move the mouse up and down to scan"
            : "Scroll inside the frame"}
        </span>
      </div>

      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="pfd-glass absolute bottom-14 left-1/2 z-20 -translate-x-1/2 rounded-pf-card border border-pf-border px-4 py-3 shadow-pf-float"
          >
            <div className="grid gap-1.5">
              {SHORTCUTS.map(([key, label]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-6 text-[12px]"
                >
                  <kbd className="rounded-pf-sm border border-pf-border bg-pf-card px-1.5 py-0.5 font-mono-pf text-[11px] text-pf-body">
                    {key}
                  </kbd>
                  <span className="text-pf-muted">{label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
