"use client";

import type { ReactNode } from "react";

/* ==========================================================================
   One moving row.

   The children are rendered TWICE and the track travels exactly half its own
   width, so the second copy arrives where the first began and the loop has no
   seam. The copy is `aria-hidden` — a screen reader hears each page once, and
   a keyboard user tabs through one set rather than two identical ones.

   TWICE IS NOT ENOUGH WHEN ONE COPY IS NARROWER THAN THE SCREEN, and the first
   cut of this had exactly that bug: five cards is about 1,140px, two copies is
   2,280px, and on a 2,000px viewport the track ran out halfway through its own
   travel and showed bare page. So `repeat` fills one copy to at least a screen
   wide FIRST, and the two halves are then identical — which is what keeps the
   -50% exact. Repeating the whole track three times instead would need the
   travel recomputed, and a seam is the one thing a marquee cannot have.

   Speed is a duration rather than a pixels-per-second: the track's width is not
   known until layout, and a row of six cards and a row of twelve looking like
   they move at the same speed matters less than either of them being smooth.
   ========================================================================== */

export function Marquee({
  children,
  reverse = false,
  seconds = 70,
  repeat = 1,
}: {
  children: ReactNode;
  /** left-to-right instead of right-to-left */
  reverse?: boolean;
  seconds?: number;
  /**
   * How many times the children fill ONE copy.
   *
   * The caller knows how wide a card is and how many there are; this component
   * knows neither, and measuring would mean a layout pass before the first
   * frame. Anything that leaves one copy at least a screen wide works.
   */
  repeat?: number;
}) {
  const copy = (
    <>
      {Array.from({ length: Math.max(1, repeat) }, (_, i) => (
        <div key={i} className="flex shrink-0 gap-4 pr-4">
          {children}
        </div>
      ))}
    </>
  );
  return (
    <div
      // py-5 is HEADROOM, not spacing. A card lifts 4px and grows a glow on
      // hover, and overflow-hidden -- which the loop cannot do without -- clipped
      // both against the top edge, so a hovered card lost its border.
      className="pfd-marquee relative overflow-hidden py-5"
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
        // No gap here. Every group already ends in pr-4, so a gap on the track
        // ADDS to it at the seam between the two halves and nowhere else --
        // one join twice as wide as every other, which is exactly what it
        // looked like.
        className={`pfd-marquee-track ${reverse ? "reverse" : ""}`}
        style={{ ["--pfd-marquee-duration" as string]: `${seconds}s` }}
      >
        <div className="flex shrink-0">{copy}</div>
        <div className="flex shrink-0" aria-hidden>
          {copy}
        </div>
      </div>
    </div>
  );
}
