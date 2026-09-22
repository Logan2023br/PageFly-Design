"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PageMockup } from "@/lib/generate/types";
import { EV, track } from "@/lib/analytics";
import { useStore } from "@/lib/store";
import { CATEGORY_BY_ID, type CategoryId } from "@/lib/pageCatalog";
import { Icon } from "../ui";
import { ResultCard } from "../results/ResultCard";
import { PreviewOverlay } from "../preview/PreviewOverlay";
import { SectionHead } from "./SectionHead";
import { useSeen } from "./useSeen";

/* ==========================================================================
   Real pages, laid out rather than sliding past.

   IT WAS TWO MARQUEES. They read as motion — a texture of work you watch — and
   the claim this section makes is not "there is a lot of it", it is "these
   eight match each other". Two cards that are never on screen at the same
   moment cannot make that claim: comparing them is the entire argument, and a
   marquee is a layout that prevents comparison. A grid is one look.

   The pages are real builds named in SHOWCASE_RUNS — see `lib/showcase.ts` for
   why that is a list rather than "the most recent".

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

/** How many the grid shows before the CTA. Four columns, two rows. */
const SHOWN = 8;

export function Showcase({ pages }: { pages: PageMockup[] }) {
  const seen = useSeen<HTMLElement>("showcase");
  const previewIndex = useStore((s) => s.previewIndex);
  const openPreview = useStore((s) => s.openPreview);
  const closePreview = useStore((s) => s.closePreview);
  const [filter, setFilter] = useState<CategoryId | "all">("all");

  useEffect(() => closePreview, [closePreview]);

  /* ==========================================================================
     THE PILLS ARE THE CATEGORIES ACTUALLY PRESENT, not a fixed row.

     The mockup's pills name three verticals — sleep supplements, skincare,
     apparel — and all three went to `#examples`, which is the section they are
     already in. A control that does nothing is worse on a page arguing that
     this product works than no control at all, so these name something real:
     the page categories in the deck on screen, which is the one axis a visitor
     can usefully narrow by.

     Derived rather than listed, so a showcase run whose deck has no landing
     page does not show a Landing pill with nothing behind it — and so a deck
     that is all one category shows no filters at all rather than `All pages`
     beside the single pill that selects the same ten pages.
     ========================================================================== */
  const cats = useMemo(() => {
    const order: CategoryId[] = [];
    for (const p of pages) if (!order.includes(p.category)) order.push(p.category);
    return order.length > 1 ? order : [];
  }, [pages]);

  /* Indices are into the FULL list, not the filtered one: the overlay steps
     through `pages`, so a filtered index would open the wrong page — which is
     the same bug the marquee had when it keyed cards by `page.id`. */
  const shown = useMemo(
    () =>
      pages
        .map((page, at) => [page, at] as const)
        .filter(([page]) => filter === "all" || page.category === filter)
        .slice(0, SHOWN),
    [pages, filter],
  );

  if (pages.length === 0) return null;

  const pill = (active: boolean) =>
    "rounded-pf-pill border px-4 py-[9px] text-[14px] transition-colors " +
    (active
      ? "border-pf-border-hi bg-pf-card-hi font-semibold text-pf-text"
      : "border-pf-border font-medium text-pf-muted hover:border-pf-border-hi hover:text-pf-text");

  return (
    <section
      ref={seen}
      className="border-t border-pf-border px-5 py-20 sm:px-8 sm:py-24 lg:px-[120px]"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center">
        <SectionHead
          eyebrow="Pages it has already built"
          title="One brief. Every page matches."
          sub="Every one of these came from the same short brief — same voice, same colours, same product facts on every page. Hover to read one all the way down; click to open it at any screen size."
        />

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {cats.length > 0 && (
            <button
              type="button"
              onClick={() => {
                track(EV.showcaseFilter, { category: "all" });
                setFilter("all");
              }}
              className={pill(filter === "all")}
            >
              All pages
            </button>
          )}
          {cats.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                track(EV.showcaseFilter, { category: id });
                setFilter(id);
              }}
              className={pill(filter === id)}
            >
              {CATEGORY_BY_ID[id]?.label ?? id}
            </button>
          ))}
          {/* DASHED, AND IT IS THE ONLY ONE THAT LEAVES. The row reads as a
              set of examples ending in "…or yours", which is the whole point of
              showing examples. A solid pill here would read as a fourth filter
              and quietly navigate away instead. */}
          <Link
            href="/design"
            onClick={() => track(EV.ctaClicked, { location: "showcase_pill" })}
            className="inline-flex items-center gap-1.5 rounded-pf-pill border border-dashed border-pf-primary-hi/50 px-4 py-[9px] text-[14px] font-semibold text-pf-primary-hi transition-colors hover:border-pf-primary-hi hover:text-pf-text"
          >
            Your store
            <Icon name="ArrowRight" size={13} />
          </Link>
        </div>

        {/* FOUR ACROSS ON A DESKTOP, and the card is 3:4 — so a column of a
            1,200px row is 282px wide and 376 tall, which is a page you can read
            the shape of. Two across on a tablet, one on a phone: three 3:4
            cards side by side at 400px would be 120px each, which is a
            thumbnail of a thumbnail. */}
        <ul className="mt-8 grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map(([page, at]) => (
            <li key={`${page.id}-${at}`}>
              <ResultCard
                page={page}
                index={at}
                rebuilding={false}
                onOpen={() => {
                  /* The page type rides along because the question is not only
                     "did they look" but "at what" — which page types get opened
                     is what later decides which ones are worth making more of.
                     `from` separates these from the five in the hero, which are
                     opened by people who have read nothing yet. */
                  track(EV.galleryOpened, {
                    page_type: page.pageType ?? "unknown",
                    from: "showcase",
                    filter,
                  });
                  openPreview(at);
                }}
                readOnly
              />
            </li>
          ))}
        </ul>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-[18px] gap-y-3">
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

      {previewIndex !== null && pages[previewIndex] && (
        <PreviewOverlay
          pages={pages}
          index={previewIndex}
          readOnly
          /* The store steps through the store's own pages, and here there are
             none — so the arrows looked enabled and did nothing. This walks the
             list actually on screen, and wraps at both ends. */
          onStep={(delta) =>
            openPreview((previewIndex + delta + pages.length) % pages.length)
          }
        />
      )}
    </section>
  );
}
