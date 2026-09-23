"use client";

import { useEffect, useRef, useState } from "react";
import { EV, track } from "@/lib/analytics";
import {
  htmlFor,
  pageflyFor,
  type ShowcasePage,
  type ShowcaseSet,
} from "@/lib/showcasePages";
import { Icon } from "../ui";

/* ==========================================================================
   ONE PAGE, DRAWN SMALL AND OPENED FULL SIZE.

   LIFTED OUT OF `HeroRail` BECAUSE TWO PLACEMENTS NOW SHOW THE SAME PAGES —
   the strip under the hero and the gallery further down. Two copies of an
   iframe that has to be sandboxed correctly, scaled correctly and loaded
   cheaply is two copies that drift, and the way they drift is silent: one gets
   a sandbox flag the other does not, and nothing on screen says so.

   THEY ARE THE REAL FILES, not this app's render of a stored design tree. Each
   card is PageFly's own preview HTML — its stylesheet, its scripts, its layout
   engine — and the .pagefly it came from is offered in the toolbar when a page
   is opened. "Real output, not a template" is a sentence anyone can write;
   handing over the file is the version that can be checked.
   ========================================================================== */

/**
 * The width a preview is rendered at before it is scaled down.
 *
 * A DESKTOP WIDTH, because that is the layout the page was designed for and the
 * one a 3:4 card reads as. Rendering at the card's own width would give a phone
 * layout shrunk to a thumbnail: correct, and unrecognisable as the page it is a
 * picture of.
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

   DESKTOP IS THE WINDOW, not 1440. A fixed desktop frame on a 1280 laptop would
   put a horizontal scrollbar under a page that fits the screen it is being read
   on. The two small frames are fixed, because 390 and 834 are the point of them.
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
 * `lazy` IS OFF BY DEFAULT AND ON FOR THE GALLERY, and the number is why. With
 * one set the whole thing was seven iframes and 108KB gzipped — less than one
 * of this app's own JavaScript chunks, so holding them back was complexity
 * buying nothing, and an earlier cut removed exactly that. With two sets the
 * page mounts TWENTY-ONE: seven in the strip and fourteen in the gallery, of
 * which fourteen are below the fold at load. Each one is a whole HTML document
 * with its own scripts. That is worth a gate; the first seven are not.
 *
 * NO HYDRATION RISK EITHER WAY, which is what made it safe to add back. The
 * iframe already renders only once the card has been MEASURED, so the server
 * emits none of them in either mode — `IntersectionObserver` being undefined
 * there changes nothing that was ever rendered.
 *
 * The weight was never the HTML anyway, it is the 200-odd external images
 * inside it, and those are made lazy when the files are written; see
 * `make-showcase-pages.ts`. A card shows the top of a tall page, so it fetches
 * the handful in that first screen and nothing else.
 *
 * THE SCALE IS MEASURED, NOT ASSUMED. It was a constant 200, true while every
 * card was 200px wide and a lie the moment they were allowed to shrink — a
 * 144px card scaled for 200 shows the page at 1.4× and crops a quarter off the
 * right edge.
 *
 * `sandbox` WITHOUT `allow-same-origin`. The scripts inside are PageFly's own
 * preview runtime and the page needs them to look like itself, so they run —
 * but in an opaque origin, where they cannot reach this document, its cookies
 * or its storage. These files are ours; the sandbox is for the day one is
 * regenerated from a store whose content nobody has read.
 */
export function PageThumb({
  set,
  page,
  lazy = false,
}: {
  set: ShowcaseSet;
  page: ShowcasePage;
  /** hold the iframe until the card is near the viewport — see above */
  lazy?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  /* ======================================================================
     DECIDED AT FIRST RENDER, NOT SET FROM INSIDE THE EFFECT.

     A browser with no `IntersectionObserver` has to load the card — one that
     never appears is worse than one that costs a request — and the obvious
     place to say so is inside the effect, which is a synchronous setState in an
     effect body and the cascading render React warns about.

     Reading it here is safe because it CANNOT change what the server rendered:
     the iframe also waits on `scale`, which is measured in the browser, so the
     server emits nothing in either state. There is no markup for the two to
     disagree about.
     ====================================================================== */
  const [near, setNear] = useState(
    () => !lazy || typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    if (near) return;
    const node = box.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      /* A screen of warning, so a card is loaded by the time it is looked at
         rather than starting to load when it arrives. */
      { rootMargin: "800px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    /* Guarded: without it a browser with no `ResizeObserver` throws here and
       `width` stays 0, which is the one value that renders no thumbnail at all.
       The measure above has already given it the right number for a layout that
       is not going to change. */
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const scale = width > 0 ? width / RENDER_WIDTH : 0;

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden bg-white">
      {near && scale > 0 && (
        <iframe
          src={htmlFor(set, page)}
          title={`${set.name} ${page.label} page preview`}
          tabIndex={-1}
          aria-hidden
          scrolling="no"
          sandbox="allow-scripts"
          /* Sized in the page's own pixels and scaled to the card. The height is
             the card's height divided by the scale, so the iframe's own viewport
             is exactly the slice that shows — anything below it is never laid
             out and its images never load. */
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

/**
 * One page, opened full size, at three widths, with its file offered.
 *
 * `from` says which placement opened it, and the two are genuinely different
 * visitors: the rail is pressed by somebody who has read nothing yet, the
 * gallery by somebody who scrolled to it.
 */
export function PageViewer({
  set,
  page,
  from,
  onClose,
}: {
  set: ShowcaseSet;
  page: ShowcasePage;
  from: string;
  onClose: () => void;
}) {
  const [frame, setFrame] = useState<FrameId>("desktop");
  const width = FRAMES.find((f) => f.id === frame)?.width ?? null;

  /* Escape closes it, and the page behind does not scroll while it is open — a
     full-screen panel whose backdrop scrolls is the thing people remember. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = had;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${set.name} — ${page.label} page`}
      className="fixed inset-0 z-[70] flex flex-col bg-[rgba(6,4,14,.92)] backdrop-blur-sm"
      onClick={onClose}
    >
      {/* The bar is its own click target: the backdrop closes, and a press on
          the toolbar must not. */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b border-pf-border px-4 py-3 sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          {/* THE SET IS NAMED. Two stores are on this page now and their pages
              share every label — both have a Home — so a panel headed only
              "Home page" cannot say which store's. */}
          <p className="truncate text-[14px] font-semibold text-pf-text">
            {set.name} — {page.label}
          </p>
          <p className="truncate text-[12px] text-pf-faint">{page.blurb}</p>
        </div>

        {/* THE THREE FRAMES, IN THE MIDDLE OF THE BAR. Between the page's name
            and the actions, because it changes what is being READ rather than
            doing something — grouped with Download and Close it would read as a
            third action. */}
        <div className="order-3 flex w-full items-center gap-0.5 rounded-pf-md border border-pf-border p-0.5 sm:order-none sm:w-auto">
          {FRAMES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFrame(f.id);
                track(EV.showcaseFrameChanged, { frame: f.id, page_type: page.slug, set: set.id, from });
              }}
              aria-pressed={frame === f.id}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors sm:flex-none ${
                frame === f.id ? "bg-pf-card-hi text-pf-text" : "text-pf-faint hover:text-pf-body"
              }`}
            >
              <Icon name={f.icon} size={13} />
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* THE FILE ITSELF, offered where the claim is made. The page on screen
              is a render of exactly these bytes, so "is this real" is answered by
              taking it rather than by a sentence. */}
          <a
            href={pageflyFor(set, page)}
            /* Prefixed with the set, because a merchant who takes one from each
               store ends up with two files called `home.pagefly`. */
            download={`${set.id}-${page.slug}.pagefly`}
            onClick={() =>
              track(EV.showcaseFileDownloaded, { page_type: page.slug, set: set.id, from })
            }
            className="inline-flex items-center gap-1.5 rounded-pf-md border border-pf-border-hi px-3 py-1.5 text-[12.5px] font-semibold text-pf-body transition-colors hover:border-pf-primary-hi hover:text-pf-text"
          >
            <Icon name="Download" size={13} />
            Download .pagefly
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-pf-md border border-pf-border p-1.5 text-pf-muted transition-colors hover:text-pf-text"
          >
            <Icon name="X" size={16} />
          </button>
        </div>
      </div>

      {/* ==================================================================
          THE FRAME IS A BOX THE PAGE IS POURED INTO.

          No transform and no zoom: the iframe is given the device's real width
          and the page lays itself out at that width, hitting its own
          breakpoints. A scaled-down desktop render would look like a phone and
          be nothing of the sort.

          Padding rather than a margin on the iframe: `h-full` and a margin
          fight each other, and the result is a frame whose bottom edge is
          pushed off the screen.
          ================================================================== */}
      <div
        className={
          "flex min-h-0 flex-1 justify-center overflow-hidden " + (width ? "p-0 sm:p-4" : "")
        }
        onClick={(e) => e.stopPropagation()}
      >
        <iframe
          /* Keyed on the frame as well as the page: changing width has to
             re-load, or the page keeps the layout it first measured. */
          key={`${set.id}-${page.slug}-${frame}`}
          src={htmlFor(set, page)}
          title={`${set.name} ${page.label} page`}
          sandbox="allow-scripts"
          /* `maxWidth` so a tablet frame on a narrow window shrinks rather than
             pushing a horizontal scrollbar under the whole panel. */
          style={width ? { width, maxWidth: "100%" } : undefined}
          className={
            "h-full min-h-0 border-0 bg-white " +
            (width ? "shrink-0 sm:rounded-pf-lg sm:shadow-pf-float" : "w-full")
          }
        />
      </div>
    </div>
  );
}
