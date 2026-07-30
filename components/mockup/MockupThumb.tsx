"use client";

import { useEffect, useRef, useState } from "react";
import type { PageMockup } from "@/lib/generate/types";
import { MockupPage } from "./MockupPage";

/* ==========================================================================
   A tall page, cropped into a card.

   The page is rendered at a real device width and scaled with a transform, so
   what you see in the card is the same layout engine the preview uses — not a
   separate "thumbnail" rendering that could drift out of sync.

   `scroll` (0..1) drives the vertical crop. The results card animates it on
   hover so the whole page can be read without opening the preview.
   ========================================================================== */

export function MockupThumb({
  page,
  renderWidth = 1280,
  scroll = 0,
  className = "",
  style,
}: {
  page: PageMockup;
  renderWidth?: number;
  scroll?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [travel, setTravel] = useState(0);

  useEffect(() => {
    const outerEl = outer.current;
    const innerEl = inner.current;
    if (!outerEl || !innerEl) return;

    const measure = () => {
      const w = outerEl.clientWidth;
      const h = outerEl.clientHeight;
      if (w === 0) return;
      const s = w / renderWidth;
      setScale(s);
      setTravel(Math.max(0, innerEl.scrollHeight * s - h));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outerEl);
    ro.observe(innerEl);
    return () => ro.disconnect();
  }, [renderWidth, page.id, page.variant]);

  return (
    <div
      ref={outer}
      className={`relative overflow-hidden ${className}`}
      style={{ background: page.tokens.bg, ...style }}
    >
      <div
        ref={inner}
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: renderWidth,
          transform: `scale(${scale}) translateY(${-scroll * (scale > 0 ? travel / scale : 0)}px)`,
          transformOrigin: "top left",
          // Hidden until measured, so the first paint isn't a full-size flash.
          opacity: scale > 0 ? 1 : 0,
          willChange: "transform",
        }}
      >
        <MockupPage page={page} width={renderWidth} />
      </div>
    </div>
  );
}
