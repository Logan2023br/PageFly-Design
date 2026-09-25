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
  return useReached<T>(() => track(EV.landingSection, { section }));
}

/* ==========================================================================
   THE SAME ONCE-PER-VISIT OBSERVATION, WITHOUT THE EVENT BAKED IN.

   LIFTED OUT OF `useSeen` RATHER THAN COPIED BESIDE IT. The showcase needed
   the identical rule for a different question — did this set get read to its
   last card — and the whole of the reasoning above applies to that answer
   unchanged: once per visit not once per crossing, and silence rather than a
   lie when there is no observer. A second copy is a second place for the
   threshold and the `fired` guard to drift, and the drift would be invisible:
   both versions would still count something.

   THE THRESHOLD IS A PARAMETER because a sentinel is not a section. A section
   is tall and a third of it entering the viewport means it was reached; a
   zero-height marker at the end of a row has no area at all, so any threshold
   above zero is one it can never satisfy — the count would simply stay at zero
   and read as nobody ever scrolling that far.
   ========================================================================== */
export function useReached<T extends HTMLElement>(fire: () => void, threshold = 0.34) {
  const ref = useRef<T | null>(null);
  /* A ref rather than state: this must not re-render anything, and the guard
     has to survive the render that would otherwise reset it. */
  const fired = useRef(false);
  /* HELD IN A REF, AND NOT IN THE DEPENDENCY LIST. The caller writes the
     callback inline, so it is a new function on every render — as a dependency
     it would tear down and rebuild the observer each time, and an observer
     rebuilt after the element is already on screen fires again. The guard
     would catch that, which is worse: it would look like it worked. */
  const latest = useRef(fire);
  /* Written in an effect rather than during render — a ref assigned on the
     render pass is a write React has not committed yet, and the lint says so.
     Seeded by `useRef(fire)` above, so the first callback is already the right
     one before this ever runs. No dependency list on purpose: it must track
     every render, which is the whole point of holding it. */
  useEffect(() => {
    latest.current = fire;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node || fired.current) return;
    if (typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || fired.current) continue;
          fired.current = true;
          latest.current();
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [threshold]);

  return ref;
}
