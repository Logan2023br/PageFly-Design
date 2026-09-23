"use client";

import { useState } from "react";
import { EV, track } from "@/lib/analytics";
import { HERO_RAIL_PAGES, HERO_SET, type ShowcasePage } from "@/lib/showcasePages";
import { Icon } from "../ui";
import { PageThumb, PageViewer } from "./PagePreview";

/* ==========================================================================
   THE WHOLE SET, UNDER THE HERO.

   The promise above them is "every page back", and a claim about a SET cannot
   be made by one screenshot. Five side by side is the claim itself: same voice,
   same colours, five different jobs — the pages a shop cannot open without.

   FIVE, NOT ALL SEVEN. Past a point a row of cards reads as a list rather than
   a set, and the blog and the sale page are the two a visitor is least likely
   to be checking for in the first three seconds. Both are in the gallery below,
   which is where somebody looking for them goes. `HERO_RAIL_PAGES` names them.

   ONE SET HERE, THOUGH THERE ARE TWO. This strip is glanced at under a
   headline and its subject is COMPLETENESS — the jobs a store needs, in one
   voice. The gallery further down is where the second set belongs, because its
   subject is the other question: whether the match is yours or a house style.
   Both sets here would be fourteen cards at 80px and answer neither.

   The card and the panel it opens live in `PagePreview`, shared with the
   gallery further down the page. See the note there for why they were lifted
   out rather than copied.
   ========================================================================== */
export function HeroRail() {
  const [open, setOpen] = useState<ShowcasePage | null>(null);

  return (
    <>
      {/* ====================================================================
          ON A DESKTOP IT FITS AND CENTRES. IT DOES NOT SCROLL.

          It used to, and the arithmetic was the reason: cards at a fixed 200px
          plus their gaps came to more than the strip had, so any window under
          about 1,300px overflowed by a hair and drew a scrollbar for it — which
          on a wide monitor looked like a bug because it was one, the row having
          room and still being clipped with the first card cut off at the left.

          Chasing that with a smaller padding only moves the width it breaks at.
          So above `lg` the cards are FLEXIBLE: they share the row, shrink to
          whatever it is, and stop growing at 200px. There is no width at which
          they overflow, so there is nothing to scroll and `justify-center` can
          do its job. Five on a 1,200px row is the full 200px each.

          BELOW `lg` IT STILL SCROLLS, on purpose. Five 3:4 cards shrunk into a
          375px phone are 63px wide — a stamp that cannot be told from the next
          one, with a label that does not fit. A strip you push sideways is the
          honest answer at that width, bleeding to the edge of the screen so the
          cut-off card reads as "more over here" rather than as a gutter.
          ==================================================================== */}
      <div className="pfd-scroll-thin -mx-5 mt-12 flex w-full items-end gap-3 overflow-x-auto px-5 pb-3 [justify-content:safe_center] sm:-mx-8 sm:gap-4 sm:px-8 lg:mx-0 lg:justify-center lg:overflow-visible lg:px-0 lg:pb-0">
        {HERO_RAIL_PAGES.map((page) => (
          <figure
            key={page.slug}
            className="group relative m-0 w-[140px] shrink-0 overflow-hidden rounded-pf-md border border-pf-border-hi bg-pf-bg-alt transition-colors hover:border-pf-primary-hi sm:w-[170px] lg:w-auto lg:min-w-0 lg:max-w-[200px] lg:flex-1 lg:shrink"
          >
            <span className="relative block aspect-[3/4]">
              <PageThumb set={HERO_SET} page={page} />
            </span>

            {/* THE CARD IS DRAWN, THE BUTTON IS LAID OVER IT. The preview is a
                whole page with its own links and buttons inside; a control
                wrapped round that is a button inside a button, which the parser
                unnests. `ResultCard` solved this first. */}
            <button
              type="button"
              onClick={() => {
                track(EV.galleryOpened, { page_type: page.slug, set: HERO_SET.id, from: "hero" });
                setOpen(page);
              }}
              aria-label={`Open the ${page.label} page`}
              className="absolute inset-0 z-10 cursor-pointer"
            />

            <figcaption className="pointer-events-none absolute bottom-2.5 left-2.5 z-20 rounded-pf-sm bg-pf-bg/85 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-pf-text">
              {page.label}
            </figcaption>

            <span className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-1.5 bg-gradient-to-t from-pf-bg/85 to-transparent pb-3 pt-8 text-[11.5px] font-semibold text-pf-text opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Icon name="Maximize" size={12} />
              Open the page
            </span>
          </figure>
        ))}
      </div>

      <p className="mt-4 text-[13px] text-pf-faint">
        Every page one brief produced. Real output, not a template.
      </p>

      {open && (
        <PageViewer set={HERO_SET} page={open} from="hero" onClose={() => setOpen(null)} />
      )}
    </>
  );
}
