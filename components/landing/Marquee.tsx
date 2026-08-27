"use client";

import type { ReactNode } from "react";

/* ==========================================================================
   One moving row.

   The children are rendered TWICE and the track travels exactly half its own
   width, so the second copy arrives where the first began and the loop has no
   seam. The copy is `aria-hidden` — a screen reader hears each page once, and
   a keyboard user tabs through one set rather than two identical ones.

   Speed is a duration rather than a pixels-per-second: the track's width is not
   known until layout, and a row of six cards and a row of twelve looking like
   they move at the same speed matters less than either of them being smooth.
   ========================================================================== */

export function Marquee({
  children,
  reverse = false,
  seconds = 70,
}: {
  children: ReactNode;
  /** left-to-right instead of right-to-left */
  reverse?: boolean;
  seconds?: number;
}) {
  return (
    <div
      className="pfd-marquee relative overflow-hidden"
      /* The fades are masks rather than gradient overlays: an overlay in the
         page background colour is wrong the moment a section behind it is not
         that colour, and this page has more than one surface. */
      style={{
        maskImage:
          "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
      }}
    >
      <div
        className={`pfd-marquee-track gap-4 ${reverse ? "reverse" : ""}`}
        style={{ ["--pfd-marquee-duration" as string]: `${seconds}s` }}
      >
        <div className="flex shrink-0 gap-4 pr-4">{children}</div>
        <div className="flex shrink-0 gap-4 pr-4" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
