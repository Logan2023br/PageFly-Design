"use client";

import Link from "next/link";
import { useState } from "react";
import { EV, track } from "@/lib/analytics";
import { SHOWCASE_PAGES, type ShowcasePage } from "@/lib/showcasePages";
import { Icon } from "../ui";
import { PageThumb, PageViewer } from "./PagePreview";
import { SectionHead } from "./SectionHead";
import { useSeen } from "./useSeen";

/* ==========================================================================
   THE SAME SEVEN PAGES, READ PROPERLY.

   The strip under the hero is a glance — seven cards at 157px, enough to see
   that they match. This is where somebody who wants to look actually looks:
   the same set at three times the size, with room for the line that says what
   each page is for.

   ONE SET, NOT TWO. It used to draw from `/api/showcase`, which is the demo
   store's most recent run, while the rail above drew from the curated list. So
   the page showed two different stores under one heading claiming they were one
   matching set, and the contradiction was invisible unless you knew where each
   came from. Same list now; `lib/showcasePages.ts` is the only place it is
   decided.

   IT WAS TWO MARQUEES BEFORE THAT. They read as motion — a texture of work you
   watch — and the claim this section makes is not "there is a lot of it", it is
   "these seven match each other". Two cards never on screen at the same moment
   cannot make that claim: comparing them is the entire argument, and a marquee
   is a layout that prevents comparison.
   ========================================================================== */
export function Showcase() {
  const seen = useSeen<HTMLElement>("showcase");
  const [open, setOpen] = useState<ShowcasePage | null>(null);

  return (
    <section
      ref={seen}
      className="border-t border-pf-border px-5 py-20 sm:px-8 sm:py-24 lg:px-[120px]"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center">
        <SectionHead
          eyebrow="Pages it has already built"
          title="One brief. Every page matches."
          sub="Seven pages from one short brief — same voice, same colours, same product facts on every page. Open any of them, read it at three screen sizes, and take the file."
        />

        {/* FOUR ACROSS ON A DESKTOP, and the card is 3:4 — so a column of a
            1,200px row is 282px wide and 376 tall, which is a page you can read
            the shape of. Two across on a tablet, one on a phone: three 3:4 cards
            side by side at 400px would be 120px each, which is a thumbnail of a
            thumbnail.

            Seven into four leaves a short last row rather than a gap in the
            middle, which is the right way round — a grid that stretches three
            cards across four columns to avoid it reads as a layout bug. */}
        <ul className="mt-9 grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {SHOWCASE_PAGES.map((page) => (
            <li key={page.slug}>
              <figure className="group relative m-0 overflow-hidden rounded-pf-card border border-pf-border bg-pf-card shadow-pf-card transition-colors hover:border-pf-primary-hi/50">
                <span className="relative block aspect-[3/4]">
                  <PageThumb page={page} />
                </span>

                {/* Over the thumbnail only, so the caption below stays
                    selectable text — and so the page's own buttons inside the
                    iframe are never wrapped in one of ours. */}
                <button
                  type="button"
                  onClick={() => {
                    track(EV.galleryOpened, { page_type: page.slug, from: "showcase" });
                    setOpen(page);
                  }}
                  aria-label={`Open the ${page.label} page`}
                  className="absolute inset-x-0 top-0 z-10 block aspect-[3/4] w-full cursor-pointer"
                />

                <span className="pointer-events-none absolute inset-x-0 top-0 z-20 flex aspect-[3/4] items-end justify-center gap-1.5 bg-gradient-to-t from-pf-bg/85 to-transparent pb-3 text-[11.5px] font-semibold text-pf-text opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <Icon name="Maximize" size={12} />
                  Open the page
                </span>

                <figcaption className="border-t border-pf-border px-3.5 py-3">
                  <span className="block text-[13.5px] font-semibold text-pf-text">
                    {page.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-pf-faint">
                    {page.blurb}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-[18px] gap-y-3">
          <Link
            href="/design"
            onClick={() => track(EV.ctaClicked, { location: "showcase" })}
            className="inline-flex min-h-12 items-center gap-2.5 rounded-pf-md bg-pf-primary px-6 py-3.5 text-[16px] font-semibold text-white shadow-pf-button transition-colors duration-150 hover:bg-pf-primary-hi"
          >
            Design pages for my store
            <Icon name="ArrowRight" size={15} />
          </Link>
          <span className="text-[13.5px] text-pf-faint">
            First 3 pages free — no card, no password.
          </span>
        </div>
      </div>

      {open && <PageViewer page={open} from="showcase" onClose={() => setOpen(null)} />}
    </section>
  );
}
