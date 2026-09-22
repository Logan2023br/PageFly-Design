"use client";

import { MockupThumb } from "../mockup/MockupThumb";
import { useStore } from "@/lib/store";
import { EV, track } from "@/lib/analytics";
import type { PageMockup } from "@/lib/generate/types";

/* ==========================================================================
   FIVE PAGES FROM ONE BRIEF, UNDER THE HERO.

   The promise above them is "every page back", and a claim about a SET cannot
   be made by one screenshot. Five side by side is the claim itself: same
   voice, same colours, five different jobs.

   THEY OPEN. In the mockup they were plain figures, and a figure that looks
   like a page is a thing every visitor tries to click — so they open the same
   preview the gallery below opens. The layout is unchanged; the dead end is
   not.
   ========================================================================== */
export function HeroRail({ pages }: { pages: PageMockup[] }) {
  const openPreview = useStore((s) => s.openPreview);

  /* ======================================================================
     FIVE DIFFERENT PAGES, NOT THE FIRST FIVE.

     The showcase deck is real output, and real output repeats: the store it
     comes from has four home pages in it. Taken in order the rail read Home,
     Collection, Product, Home, Collection — which makes the opposite of the
     claim above it, that one brief produces a set of DIFFERENT pages.

     Indices stay the ones into `pages`, because the overlay `Showcase` mounts
     steps through that array — a position in this shortened list would open
     somebody else's page. It is the same trap the marquee fell into keying
     cards by `page.id`.
     ====================================================================== */
  const five: (readonly [PageMockup, number])[] = [];
  const taken = new Set<string>();
  for (const [page, at] of pages.map((p, i) => [p, i] as const)) {
    const kind = page.pageType ?? page.id;
    if (taken.has(kind)) continue;
    taken.add(kind);
    five.push([page, at]);
    if (five.length === 5) break;
  }
  if (five.length === 0) return null;

  return (
    <>
      {/* ====================================================================
          IT SCROLLS TO THE EDGE OF THE SCREEN, NOT TO THE EDGE OF THE PADDING.

          The hero already has 20px of side padding, and this had its own on top
          of it — so on a phone the strip was inset 40px and the fifth card was
          cut off inside a box with a visible gutter beside it, which reads as
          broken rather than as "scroll me". Pulled back out by the same amount
          and given the padding back as its own, the cards run under the edge of
          the screen, which is the only thing that says a row continues.

          `safe center` rather than `center`, and that is the whole reason the
          keyword exists: a plain `justify-content: center` on a row wider than
          its box overflows in BOTH directions, pushing the first card off to
          the left where no amount of scrolling reaches it. `safe` centres while
          it fits and falls back to the start when it does not.
          ==================================================================== */}
      <div className="-mx-5 mt-12 flex w-full items-end gap-4 overflow-x-auto px-5 pb-1 [justify-content:safe_center] sm:-mx-8 sm:px-8 lg:-mx-[120px] lg:px-[120px]">
        {five.map(([page, at]) => (
          <figure
            key={`${page.id}-${at}`}
            className="relative m-0 w-[150px] shrink-0 overflow-hidden rounded-pf-md border border-pf-border-hi bg-pf-bg-alt sm:w-[200px]"
          >
            {/* THE THUMB IS NOT INSIDE THE BUTTON, and that is not a style
                choice. `MockupThumb` renders the merchant's actual page — which
                has its own buttons in it, an add-to-cart among them — so a
                button wrapped round it is a button inside a button, which the
                HTML parser unnests and React reports. ResultCard solved this
                first: the thumb is drawn, and the click target is an empty
                overlay laid across it. */}
            <span className="block aspect-[3/4]">
              <MockupThumb page={page} scroll={0} className="size-full" />
            </span>
            <button
              type="button"
              onClick={() => {
                track(EV.galleryOpened, { page_type: page.pageType ?? "unknown", from: "hero" });
                openPreview(at);
              }}
              aria-label={`Open ${page.label} preview`}
              className="absolute inset-0 z-10 cursor-pointer"
            />
            <figcaption className="pointer-events-none absolute bottom-2.5 left-2.5 z-20 rounded-pf-sm bg-pf-bg/85 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-pf-text">
              {page.label}
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="mt-4 text-[13px] text-pf-faint">
        Five of the pages one brief produced. Real output, not a template.
      </p>
    </>
  );
}
