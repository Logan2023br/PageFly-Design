"use client";

import { useEffect, useRef, useState } from "react";
import { EV, track } from "@/lib/analytics";
import { SHOWCASE_PAGES, htmlFor, pageflyFor, type ShowcasePage } from "@/lib/showcasePages";
import { Icon } from "../ui";

/* ==========================================================================
   FIVE PAGES FROM ONE BRIEF, UNDER THE HERO.

   The promise above them is "every page back", and a claim about a SET cannot
   be made by one screenshot. Five side by side is the claim itself: same
   voice, same colours, five different jobs.

   THEY ARE THE REAL FILES NOW, not this app's render of a stored design tree.
   Each card is PageFly's own preview HTML for that page — its stylesheet, its
   scripts, its layout engine — and the .pagefly it came from sits beside it,
   offered on the way out. "Real output, not a template" is a sentence anyone
   can write; handing over the file is the version of it that can be checked.

   It also fixes what the rail was actually showing. It took whatever the demo
   store's showcase run held, which was four home pages and a collection — the
   same job five times, under a line claiming a matching SET. See
   `lib/showcasePages.ts`.
   ========================================================================== */

/**
 * The width the preview is rendered at before it is scaled down.
 *
 * A DESKTOP WIDTH, because that is the layout the page was designed for and
 * the one a 3:4 card reads as. Rendering at the card's own 200px would give a
 * phone layout shrunk to a thumbnail: correct, and unrecognisable as the page
 * it is a picture of.
 */
const RENDER_WIDTH = 1280;

/**
 * One page, drawn small.
 *
 * THE IFRAME IS NOT LOADED UNTIL IT IS ON SCREEN, and on this page that matters
 * more than it usually does. The five previews carry 177 external images
 * between them; the script that writes them makes every one lazy — see
 * `make-showcase-pages.ts` — so a card fetches only what is in the first screen
 * of a tall page, and only once the rail is actually in view. Above the fold on
 * a laptop that is immediately, which is right; on a phone the four cards off
 * to the right cost nothing until they are scrolled to.
 *
 * `sandbox` WITHOUT `allow-same-origin`. The scripts inside are PageFly's own
 * preview runtime and the page needs them to look like itself, so they run —
 * but in an opaque origin, where they cannot reach this document, its cookies
 * or its storage. These files are ours; the sandbox is for the day one of them
 * is regenerated from a store whose content we have not read.
 */
function Thumb({ page, eager }: { page: ShowcasePage; eager: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(eager);

  useEffect(() => {
    if (show) return;
    const node = box.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      /* No observer, so load it — a card that never appears is worse than one
         that costs a request. */
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      /* A screen of warning, so a card is loaded by the time it is looked at
         rather than starting to load when it arrives. */
      { rootMargin: "600px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [show]);

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden bg-white">
      {show && (
        <iframe
          src={htmlFor(page)}
          title={`${page.label} page preview`}
          tabIndex={-1}
          aria-hidden
          scrolling="no"
          sandbox="allow-scripts"
          /* Sized in the page's own pixels and scaled to the card. The height
             is the card's height divided by the scale, so the iframe's own
             viewport is exactly the slice that shows — anything below it is
             never laid out and its images never load. */
          style={{
            width: RENDER_WIDTH,
            height: `${(100 * RENDER_WIDTH) / 200}%`,
            transform: `scale(${200 / RENDER_WIDTH})`,
            transformOrigin: "top left",
          }}
          className="pointer-events-none border-0"
        />
      )}
    </div>
  );
}

export function HeroRail() {
  const [open, setOpen] = useState<ShowcasePage | null>(null);

  /* Escape closes it, and the page behind does not scroll while it is open —
     a full-screen panel whose backdrop scrolls is the thing people remember. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = had;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* ====================================================================
          IT SCROLLS TO THE EDGE OF THE SCREEN, NOT TO THE EDGE OF THE PADDING.

          The hero already has side padding and this had its own on top of it,
          so on a phone the strip was inset twice and the fifth card was cut off
          inside a box with a visible gutter beside it — which reads as broken
          rather than as "scroll me".

          `safe center` rather than `center`: a plain centre on a row wider than
          its box overflows in BOTH directions, pushing the first card off to
          the left where no amount of scrolling reaches it.

          `pfd-scroll-thin` and `pb-3` so the scrollbar has somewhere to sit
          that is not across the bottom of the artwork.
          ==================================================================== */}
      <div className="pfd-scroll-thin -mx-5 mt-12 flex w-full items-end gap-4 overflow-x-auto px-5 pb-3 [justify-content:safe_center] sm:-mx-8 sm:px-8 lg:-mx-[120px] lg:px-[120px]">
        {SHOWCASE_PAGES.map((page, at) => (
          <figure
            key={page.slug}
            className="group relative m-0 w-[150px] shrink-0 overflow-hidden rounded-pf-md border border-pf-border-hi bg-pf-bg-alt transition-colors hover:border-pf-primary-hi sm:w-[200px]"
          >
            <span className="relative block aspect-[3/4]">
              {/* The first is eager: it is the one on screen on every load, and
                  waiting a frame for an observer to say so makes the hero flash
                  an empty card. */}
              <Thumb page={page} eager={at === 0} />
            </span>

            {/* THE CARD IS DRAWN, THE BUTTON IS LAID OVER IT. The preview is a
                whole page with its own links and buttons inside; a control
                wrapped round that is a button inside a button, which the parser
                unnests. `ResultCard` solved this first. */}
            <button
              type="button"
              onClick={() => {
                track(EV.galleryOpened, { page_type: page.slug, from: "hero" });
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
        Five of the pages one brief produced. Real output, not a template.
      </p>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${open.label} page`}
          className="fixed inset-0 z-[70] flex flex-col bg-[rgba(6,4,14,.92)] backdrop-blur-sm"
          onClick={() => setOpen(null)}
        >
          {/* The bar is its own click target: the backdrop closes, and a press
              on the toolbar must not. */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-b border-pf-border px-4 py-3 sm:px-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-pf-text">
                {open.label} page
              </p>
              <p className="truncate text-[12px] text-pf-faint">{open.blurb}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* THE FILE ITSELF, offered where the claim is made. The page on
                  screen is a render of exactly these bytes, so "is this real"
                  is answered by taking it rather than by a sentence. */}
              <a
                href={pageflyFor(open)}
                download={`${open.slug}.pagefly`}
                onClick={() =>
                  track(EV.showcaseFileDownloaded, { page_type: open.slug, from: "hero" })
                }
                className="inline-flex items-center gap-1.5 rounded-pf-md border border-pf-border-hi px-3 py-1.5 text-[12.5px] font-semibold text-pf-body transition-colors hover:border-pf-primary-hi hover:text-pf-text"
              >
                <Icon name="Download" size={13} />
                Download .pagefly
              </a>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Close"
                className="rounded-pf-md border border-pf-border p-1.5 text-pf-muted transition-colors hover:text-pf-text"
              >
                <Icon name="X" size={16} />
              </button>
            </div>
          </div>

          {/* FULL SIZE AND SCROLLABLE, which is the whole point of opening it —
              the card is the top of a long page and this is the rest. Scripts
              run here too, so the sliders and the accordions work; still no
              `allow-same-origin`, so they cannot reach this document. */}
          <iframe
            key={open.slug}
            src={htmlFor(open)}
            title={`${open.label} page`}
            sandbox="allow-scripts"
            onClick={(e) => e.stopPropagation()}
            className="min-h-0 flex-1 border-0 bg-white"
          />
        </div>
      )}
    </>
  );
}
