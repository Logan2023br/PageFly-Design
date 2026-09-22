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
  const five = pages.slice(0, 5);
  if (five.length === 0) return null;

  return (
    <>
      <div className="mt-12 flex w-full items-end justify-center gap-4 overflow-x-auto px-5 pb-1">
        {five.map((page, at) => (
          <figure
            key={page.id}
            className="relative m-0 w-[150px] shrink-0 overflow-hidden rounded-pf-md border border-pf-border-hi bg-pf-bg-alt sm:w-[200px]"
          >
            <button
              type="button"
              onClick={() => {
                track(EV.galleryOpened, { page_type: page.pageType ?? "unknown", from: "hero" });
                openPreview(at);
              }}
              aria-label={`Open ${page.label} preview`}
              className="block w-full cursor-pointer"
            >
              <span className="block aspect-[3/4]">
                <MockupThumb page={page} scroll={0} className="size-full" />
              </span>
            </button>
            <figcaption className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-pf-sm bg-pf-bg/85 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-pf-text">
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
