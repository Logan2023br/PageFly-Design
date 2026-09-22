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

/* ==========================================================================
   THE THREE WIDTHS A PAGE IS JUDGED AT.

   The preview opened at one width and that was the whole of it, which for a
   merchant asking "will this work on a phone" answers nothing — and it is the
   question they ask, because most of their traffic is one. These files are
   PageFly's real output with PageFly's real breakpoints in them, so changing
   the frame's width genuinely re-lays the page out; it is not a zoom.

   Taken from `lib/generate/types` so the front door offers the same sizes the
   signed-in preview does, minus Laptop — four frames is one more choice than
   the question needs, and "desktop, tablet, mobile" is the phrase the rest of
   the product already uses.

   DESKTOP IS THE WINDOW, not 1440. A fixed desktop frame on a 1280 laptop
   would put a horizontal scrollbar under a page that fits the screen it is
   being read on. The two small frames are fixed, because 390 and 834 are the
   point of them.
   ========================================================================== */
const FRAMES = [
  { id: "desktop", label: "Desktop", width: null, icon: "Monitor" },
  { id: "tablet", label: "Tablet", width: 834, icon: "Tablet" },
  { id: "mobile", label: "Mobile", width: 390, icon: "Smartphone" },
] as const;

type FrameId = (typeof FRAMES)[number]["id"];

/**
 * One page, drawn small.
 *
 * ALL FIVE LOAD, AND THAT IS A MEASURED DECISION rather than a lazy one. The
 * first cut held each iframe back behind an `IntersectionObserver`, on the
 * assumption that five previews was a lot of weight for a hero. Measured, the
 * five come to 84KB gzipped between them — less than one of this app's own
 * JavaScript chunks. The weight was never the HTML, it was the 177 external
 * images inside it, and those are made lazy when the files are written; see
 * `make-showcase-pages.ts`. A card shows the top of a tall page, so it fetches
 * the handful in that first screen and nothing else.
 *
 * Dropping the observer also drops two real problems it brought with it: a
 * white card on first paint while the observer decided, and a hydration
 * mismatch waiting to happen, since `IntersectionObserver` is undefined on the
 * server and defined in the browser.
 *
 * THE SCALE IS MEASURED, NOT ASSUMED. It was the constant 200, which was true
 * while every card was 200px wide and became a lie the moment they were allowed
 * to shrink — a 144px card scaled for 200 shows the page at 1.4× and crops a
 * quarter of it off the right edge.
 *
 * `sandbox` WITHOUT `allow-same-origin`. The scripts inside are PageFly's own
 * preview runtime and the page needs them to look like itself, so they run —
 * but in an opaque origin, where they cannot reach this document, its cookies
 * or its storage. These files are ours; the sandbox is for the day one of them
 * is regenerated from a store whose content we have not read.
 */
function Thumb({ page }: { page: ShowcasePage }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    /* Guarded: without it a browser with no `ResizeObserver` throws here and
       `width` stays 0, which is the one value that renders no thumbnail at
       all. The measure above has already given it the right number for a
       layout that is not going to change. */
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const scale = width > 0 ? width / RENDER_WIDTH : 0;

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden bg-white">
      {scale > 0 && (
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
            height: `${100 / scale}%`,
            transform: `scale(${scale})`,
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
  const [frame, setFrame] = useState<FrameId>("desktop");
  /* null on Desktop, which means "as wide as the window" — see `FRAMES`. */
  const width = FRAMES.find((f) => f.id === frame)?.width ?? null;

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
          ON A DESKTOP IT FITS AND CENTRES. IT DOES NOT SCROLL.

          It used to, and the arithmetic was the reason: five 200px cards and
          four 16px gaps is 1,064px, laid inside a strip that had the hero's
          120px padding on each side. Any window under about 1,300px overflowed
          by a hair and drew a scrollbar for it, which on a wide monitor looked
          like a bug because it was one — the row had room and was still
          clipped, with the first card cut off at the left.

          Chasing that with a smaller padding only moves the width it breaks at.
          So above `lg` the cards are FLEXIBLE: they share the row, shrink to
          whatever it is, and stop growing at 200px. There is no width at which
          they overflow, so there is nothing to scroll and `justify-center` can
          do its job.

          BELOW `lg` IT STILL SCROLLS, on purpose. Five 3:4 cards shrunk into a
          375px phone are 60px wide — a postage stamp that cannot be told apart
          from the next one, with a label that does not fit. A strip you push
          sideways is the honest answer at that width, bleeding to the edge of
          the screen so the cut-off card reads as "more over here" rather than
          as a gutter.
          ==================================================================== */}
      <div className="pfd-scroll-thin -mx-5 mt-12 flex w-full items-end gap-3 overflow-x-auto px-5 pb-3 [justify-content:safe_center] sm:-mx-8 sm:gap-4 sm:px-8 lg:mx-0 lg:justify-center lg:overflow-visible lg:px-0 lg:pb-0">
        {SHOWCASE_PAGES.map((page) => (
          <figure
            key={page.slug}
            className="group relative m-0 w-[140px] shrink-0 overflow-hidden rounded-pf-md border border-pf-border-hi bg-pf-bg-alt transition-colors hover:border-pf-primary-hi sm:w-[170px] lg:w-auto lg:min-w-0 lg:max-w-[200px] lg:flex-1 lg:shrink"
          >
            <span className="relative block aspect-[3/4]">
              <Thumb page={page} />
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
                /* Every page opens at Desktop. Carrying the last choice over
                   means somebody who read one page on a phone frame opens the
                   next in a 390px column and reads it as the page being
                   narrow. Set here, in the event, rather than in an effect
                   watching `open` — it is a consequence of the press, not a
                   thing to synchronise afterwards. */
                setFrame("desktop");
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

            {/* THE THREE FRAMES, IN THE MIDDLE OF THE BAR. Between the page's
                name and the actions, because it changes what is being READ
                rather than doing something — grouped with Download and Close it
                would read as a third action. */}
            <div className="order-3 flex w-full items-center gap-0.5 rounded-pf-md border border-pf-border p-0.5 sm:order-none sm:w-auto">
              {FRAMES.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setFrame(f.id);
                    track(EV.showcaseFrameChanged, { frame: f.id, page_type: open.slug });
                  }}
                  aria-pressed={frame === f.id}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors sm:flex-none ${
                    frame === f.id
                      ? "bg-pf-card-hi text-pf-text"
                      : "text-pf-faint hover:text-pf-body"
                  }`}
                >
                  <Icon name={f.icon} size={13} />
                  {f.label}
                </button>
              ))}
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

          {/* ==================================================================
              THE FRAME IS A BOX THE PAGE IS POURED INTO.

              No transform and no zoom: the iframe is given the device's real
              width and the page lays itself out at that width, hitting its own
              breakpoints. A scaled-down desktop render would look like a phone
              and be nothing of the sort.

              CENTRED ON A GROUND, not edge to edge, so a 390px column on a wide
              monitor reads as a phone being held up rather than as a page that
              failed to fill the screen.

              Scripts run here too, so the sliders and the accordions work;
              still no `allow-same-origin`, so they cannot reach this document.
              ================================================================== */}
          <div
            className={
              "flex min-h-0 flex-1 justify-center overflow-hidden " +
              /* Padding rather than a margin on the iframe: `h-full` and a
                 margin fight each other, and the result is a frame whose
                 bottom edge is pushed off the screen. */
              (width ? "p-0 sm:p-4" : "")
            }
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              /* Keyed on the frame as well as the page: changing width has to
                 re-load, or the page keeps the layout it first measured. */
              key={`${open.slug}-${frame}`}
              src={htmlFor(open)}
              title={`${open.label} page`}
              sandbox="allow-scripts"
              /* `maxWidth` so a tablet frame on a narrow window shrinks rather
                 than pushing a horizontal scrollbar under the whole panel. */
              style={width ? { width, maxWidth: "100%" } : undefined}
              className={
                "h-full min-h-0 border-0 bg-white " +
                (width ? "shrink-0 sm:rounded-pf-lg sm:shadow-pf-float" : "w-full")
              }
            />
          </div>

        </div>
      )}
    </>
  );
}
