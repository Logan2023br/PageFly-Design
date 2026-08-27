"use client";

import { useEffect } from "react";
import type { PageMockup } from "@/lib/generate/types";
import { useStore } from "@/lib/store";
import { ResultCard } from "../results/ResultCard";
import { PreviewOverlay } from "../preview/PreviewOverlay";
import { Marquee } from "./Marquee";

/* ==========================================================================
   Real pages, on the way in.

   Two rows crossing, because one row reads as a filmstrip and two read as a
   volume of work. The pages are real builds named in SHOWCASE_RUNS — see
   `lib/showcase.ts` for why that is a list rather than "the most recent".

   The cards are the same `ResultCard` the signed-in results grid uses, with
   `readOnly` dropping the two buttons that need an account. A visitor gets the
   hover auto-scroll and the full preview; what they do not get is a button that
   would fail.

   PREVIEW STATE COMES FROM THE STORE, not from local state here, and the first
   cut had it the other way round. The overlay closes itself through
   `closePreview` and steps through `stepPreview` — both on the store — so local
   state opened a panel that could not be closed or navigated. It is cleared on
   unmount so nothing is left behind for whoever signs in next in this tab.
   ========================================================================== */

export function Showcase({ pages }: { pages: PageMockup[] }) {
  const previewIndex = useStore((s) => s.previewIndex);
  const openPreview = useStore((s) => s.openPreview);
  const closePreview = useStore((s) => s.closePreview);

  useEffect(() => closePreview, [closePreview]);

  if (pages.length === 0) return null;

  /* Split so the two rows are different pages rather than the same ones
     passing each other, which reads as a loop rather than a body of work. */
  const half = Math.ceil(pages.length / 2);
  const rows = [pages.slice(0, half), pages.slice(half)];

  /* ==========================================================================
     SPEED IS PIXELS PER SECOND, not a duration.

     It was a duration, and shrinking the cards from 340 to 212 quietly made
     both rows two-thirds slower: the track got shorter, the time to cross it
     did not, and a marquee at 14px/s reads as broken rather than calm. Any
     future change to the card width or the deck size would have done it again.

     So the duration is computed from the distance actually travelled — half the
     track, which is one copy of the cards. The two rows differ slightly so they
     never fall into step, which looks mechanical.
     ========================================================================== */
  const CARD = 212 + 16; // width plus the gap between cards
  const secondsFor = (count: number, pxPerSecond: number) =>
    Math.max(18, Math.round((count * CARD) / pxPerSecond));

  const card = (page: PageMockup) => (
    /* Small on purpose. A card is 3:4, so its height follows its width and one
       number sets both — at 340 the two rows were taller than most screens and
       a visitor saw one and a half. These are a texture of work you scan, not
       pages you read here; reading one is what the preview is for. */
    <div key={page.id} className="w-[184px] shrink-0 sm:w-[212px]">
      <ResultCard
        page={page}
        index={pages.indexOf(page)}
        rebuilding={false}
        onOpen={() => openPreview(pages.indexOf(page))}
        readOnly
      />
    </div>
  );

  return (
    <section className="py-14 sm:py-20">
      <div className="mx-auto mb-8 max-w-3xl px-5 text-center">
        <h2 className="font-display text-pf-h2 font-semibold text-pf-text">
          Pages it has already built
        </h2>
        <p className="mt-3 text-pf-body text-pf-muted">
          Real builds, not mockups of mockups. Hover to read one all the way
          down; click to open it at any screen size.
        </p>
      </div>

      <div className="grid gap-4">
        <Marquee seconds={secondsFor(rows[0].length, 52)}>{rows[0].map(card)}</Marquee>
        {rows[1].length > 0 && (
          <Marquee seconds={secondsFor(rows[1].length, 44)} reverse>
            {rows[1].map(card)}
          </Marquee>
        )}
      </div>

      {previewIndex !== null && pages[previewIndex] && (
        <PreviewOverlay pages={pages} index={previewIndex} readOnly />
      )}
    </section>
  );
}
