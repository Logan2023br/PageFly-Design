"use client";

import { useEffect, useRef } from "react";
import { EV, track, type LandingSection } from "@/lib/analytics";

/* ==========================================================================
   A SECTION REPORTS THAT IT WAS REACHED, ONCE.

   ONCE PER VISIT, NOT ONCE PER CROSSING. A visitor who scrolls past the FAQ,
   goes back up to re-read the comparison and comes down again has reached the
   FAQ once; counted twice, the section below the fold reads as more visited
   than the hero, and the funnel inverts.

   THE THRESHOLD IS A THIRD, not a pixel. A section clipping the bottom of the
   viewport by two pixels has not been read, and at 100% a tall section on a
   short screen can never fire at all — which is the same silence as not
   measuring it.

   NO OBSERVER, NO EVENT, AND THAT IS DELIBERATE. `IntersectionObserver` is
   missing in a few embedded browsers; firing on mount instead would report a
   full read from someone who saw the header. A missing count is a hole; a
   wrong one is a decision made on a lie.
   ========================================================================== */
export function useSeen<T extends HTMLElement>(section: LandingSection) {
  const ref = useRef<T | null>(null);
  /* A ref rather than state: this must not re-render anything, and the guard
     has to survive the render that would otherwise reset it. */
  const fired = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || fired.current) return;
    if (typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || fired.current) continue;
          fired.current = true;
          track(EV.landingSection, { section });
          io.disconnect();
        }
      },
      { threshold: 0.34 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [section]);

  return ref;
}
