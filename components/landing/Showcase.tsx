"use client";

import Link from "next/link";
import { useState } from "react";
import { EV, track } from "@/lib/analytics";
import { SHOWCASE_SETS, type ShowcasePage, type ShowcaseSet } from "@/lib/showcasePages";
import { Icon } from "../ui";
import { PageThumb, PageViewer } from "./PagePreview";
import { SectionHead } from "./SectionHead";
import { useSeen } from "./useSeen";

/* ==========================================================================
   TWO STORES, SEVEN PAGES EACH, AND THE SECOND SET IS THE ARGUMENT.

   One set proves the pages of a store match each other — which is worth
   proving, and is what the strip under the hero does at a glance. It does not
   answer the question a merchant actually has, which is whether that match is
   THEIRS or a house style this thing puts on everything.

   Two sets answer it, and only by being unalike: Hexwood is near-black and
   loud, Hollis & Rowe is ivory and quiet, and nothing is shared between them
   except the pipeline. Side by side they say the brief decided the look. Shown
   one at a time behind a filter they would not, because nobody compares things
   they have to click between.

   ONE SET USED TO BE A QUERY. The gallery drew from `/api/showcase` — the demo
   store's most recent run — while the rail above drew from the curated list, so
   the page showed two different stores under one heading claiming they were one
   matching set, and nothing said which half came from where. Both read
   `lib/showcasePages.ts` now; that contradiction is the reason this is a list.
   ========================================================================== */

export function Showcase() {
  const seen = useSeen<HTMLElement>("showcase");
  /* The set AND the page, because both are needed to find the files and every
     set has a page called Home. A slug alone would open whichever one the code
     happened to look in first. */
  const [open, setOpen] = useState<{ set: ShowcaseSet; page: ShowcasePage } | null>(null);

  return (
    <section
      ref={seen}
      className="border-t border-pf-border px-5 py-20 sm:px-8 sm:py-24 lg:px-[120px]"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center">
        <SectionHead
          eyebrow="Pages it has already built"
          title="Two briefs. Two stores. Every page matches."
          sub="Seven pages each, from one short brief each — same voice, same colours, same product facts across a set, and nothing shared between the two. Open any of them, read it at three screen sizes, and take the file."
        />

        {SHOWCASE_SETS.map((set, at) => (
          <div key={set.id} className={at === 0 ? "w-full" : "mt-14 w-full"}>
            {/* THE SET IS NAMED ABOVE ITS ROW. Both stores have a page called
                Home, so a grid of fourteen cards with no headings is fourteen
                cards a reader has to sort by eye. The rule and the name do that
                for them, and the blurb says what the look is so the contrast is
                stated rather than left to be noticed. */}
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-pf-border pt-5">
              <h3 className="font-display text-[18px] font-semibold tracking-[-0.011em] text-pf-text">
                {set.name}
              </h3>
              <p className="text-[13px] text-pf-faint">{set.blurb}</p>
            </div>

            {/* FOUR ACROSS ON A DESKTOP, and the card is 3:4 — so a column of a
                1,200px row is 282px wide and 376 tall, which is a page you can
                read the shape of. Two across on a tablet, one on a phone: three
                3:4 cards at 400px would be 120px each, a thumbnail of a
                thumbnail. Seven into four leaves a short last row, which is the
                right way round — stretching three cards across four columns to
                avoid it reads as a layout bug. */}
            <ul className="mt-5 grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {set.pages.map((page) => (
                <li key={page.slug}>
                  <figure className="group relative m-0 overflow-hidden rounded-pf-card border border-pf-border bg-pf-card shadow-pf-card transition-colors hover:border-pf-primary-hi/50">
                    <span className="relative block aspect-[3/4]">
                      {/* Fourteen of these are below the fold at load — see `PageThumb`. */}
                      <PageThumb set={set} page={page} lazy />
                    </span>

                    {/* Over the thumbnail only, so the caption below stays
                        selectable text — and so the page's own buttons inside
                        the iframe are never wrapped in one of ours. */}
                    <button
                      type="button"
                      onClick={() => {
                        track(EV.galleryOpened, {
                          page_type: page.slug,
                          set: set.id,
                          from: "showcase",
                        });
                        setOpen({ set, page });
                      }}
                      aria-label={`Open the ${set.name} ${page.label} page`}
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
          </div>
        ))}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-[18px] gap-y-3">
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

      {open && (
        <PageViewer
          set={open.set}
          page={open.page}
          from="showcase"
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
