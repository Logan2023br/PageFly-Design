"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { COLLECTIONS, shortenLabels, shotFor, type CollectionMeta } from "@/lib/collections";
import {
  combinePagefly,
  pageToHtml,
  readPageflyPage,
  type PageflyPage,
} from "@/lib/collections/pagefly";
import { DEVICES, type PageMockup } from "@/lib/generate/types";
import { PreviewOverlay } from "../preview/PreviewOverlay";
import { InstallPageFlyLink } from "../pagefly/InstallPageFly";
import { Button, Icon, Panel } from "../ui";

/* ==========================================================================
   Free collections, under the build that is still running.

   THE SCREEN THIS SITS ON IS A FIFTEEN-MINUTE WAIT with nothing in the lower
   two thirds of it, and a merchant who leaves the tab is a merchant who comes
   back to a finished deck they never saw. Something worth reading is the
   reason to stay, and free page sets are the thing this product has that is
   worth reading.

   FETCHED WHEN THE CARD IS SEEN, not when the screen mounts. A set is about
   200KB of zip and its images are data URIs inside it; pulling every set on
   mount would compete for bandwidth with the build the merchant is actually
   waiting for. An IntersectionObserver is what makes that the browser's
   decision rather than ours.

   DRAWN INTO AN IFRAME. `lib/collections/pagefly.ts` explains why at length —
   the short version is that a page's own stylesheet and this app's would
   otherwise reach into each other.
   ========================================================================== */

export function CollectionsSection() {
  const [open, setOpen] = useState<CollectionMeta | null>(null);

  if (COLLECTIONS.length === 0) return null;

  return (
    <section className="mt-14 border-t border-pf-border pt-9">
      <div className="mb-5 text-center">
        <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-pf-text sm:text-[24px]">
          Collections you can use free
        </h2>
        <p className="mx-auto mt-1.5 max-w-[460px] text-[13px] leading-relaxed text-pf-muted">
          Complete page sets, ready to import into PageFly. Yours while this
          build finishes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COLLECTIONS.map((collection) => (
          <CollectionCard
            key={collection.slug}
            collection={collection}
            onOpen={() => setOpen(collection)}
          />
        ))}
      </div>

      {/* These are .pagefly files too, so somebody downloading one needs the
          same app — and here it is more likely they do not have it, because a
          visitor can reach this section without ever having built anything. */}
      <div className="mt-4 text-center">
        <InstallPageFlyLink />
      </div>

      <AnimatePresence>
        {open && <CollectionDetail collection={open} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </section>
  );
}

/* ---- loading one set ------------------------------------------------------ */

type SetState =
  | { status: "idle" }
  | { status: "loading" }
  /** `raw` is one .pagefly per page, in step with `pages` */
  | { status: "ready"; pages: PageflyPage[]; raw: Uint8Array[] }
  | { status: "failed" };

/**
 * Fetch and parse a set, once, and not before it is wanted.
 *
 * The bytes are kept alongside the parsed pages because Export hands over the
 * FILE — the same bytes that drew the preview, so what a merchant sees and
 * what they download cannot be different things.
 */
function useCollection(collection: CollectionMeta, wanted: boolean): SetState {
  const [state, setState] = useState<SetState>({ status: "idle" });
  const started = useRef(false);
  const files = collection.files;

  useEffect(() => {
    if (!wanted || started.current) return;
    started.current = true;
    setState({ status: "loading" });

    let live = true;
    void (async () => {
      try {
        /* In parallel, and in the manifest's order however they come back —
           `Promise.all` preserves it, which is what keeps `raw[i]` the file for
           `pages[i]` and therefore what keeps the Export button on a card
           pointed at the page above it. */
        const raw = await Promise.all(
          files.map(async (file) => {
            const res = await fetch(file);
            if (!res.ok) throw new Error(`${file} ${res.status}`);
            return new Uint8Array(await res.arrayBuffer());
          }),
        );
        if (live) setState({ status: "ready", pages: raw.map(readPageflyPage), raw });
      } catch {
        /* A card that says nothing is better than one that says the set is
           broken: the merchant did not ask for this and cannot act on it. */
        if (live) setState({ status: "failed" });
      }
    })();

    return () => {
      live = false;
    };
  }, [files, wanted]);

  return state;
}

/** The bytes as a download, named for the set. */
function download(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  /* Revoked on the next tick rather than immediately — Safari has not started
     reading the blob by the time click() returns. */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---- the card ------------------------------------------------------------- */

function CollectionCard({
  collection,
  onOpen,
}: {
  collection: CollectionMeta;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const [seen, setSeen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  /* Seen, not mounted. See the note at the top about not competing with the
     build for bandwidth. */
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setSeen(true),
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const state = useCollection(collection, seen);
  const pages = state.status === "ready" ? state.pages : [];
  /* The home page is the cover, and it is found by name rather than by
     position: the export orders by whatever the merchant dragged where, and in
     this set Home is LAST. Falling back to the first page means a set with no
     page called home still has a cover. */
  const cover = pages.find((p) => /home/i.test(p.label)) ?? pages[0] ?? null;

  return (
    <div ref={box}>
    <Panel className="group relative overflow-hidden transition-shadow duration-200 hover:border-pf-primary-hi/50 hover:shadow-pf-glow">
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="block w-full text-left"
        aria-label={`Open ${collection.name}`}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-pf-bg-deep">
          {cover ? (
            <PagePreview
              page={cover}
              scrolling={hovered && !reduced}
              shot={shotFor(collection, cover.label, "card")}
            />
          ) : (
            <div className="grid size-full place-items-center">
              <span className="text-[12px] text-pf-faint">
                {state.status === "failed" ? "Preview unavailable" : "Loading…"}
              </span>
            </div>
          )}

          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-pf-bg/85 to-transparent pb-3 pt-8 text-[11.5px] font-semibold text-pf-text opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Icon name="Eye" size={13} />
            {pages.length > 0 ? `See all ${pages.length} pages` : "See the set"}
          </span>
        </div>

        <div className="border-t border-pf-border px-3.5 py-3">
          <p className="text-[13.5px] font-semibold text-pf-text">{collection.name}</p>
          <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-pf-muted">
            {collection.blurb}
          </p>
        </div>
      </button>

      {/* Top left, over the preview, and outside the button above — a button
          inside a button is markup a browser is entitled to rearrange. */}
      <div className="absolute left-2.5 top-2.5 z-10">
        <Button
          size="sm"
          variant="ghost"
          icon="Download"
          disabled={state.status !== "ready"}
          onClick={() =>
            state.status === "ready" &&
            download(combinePagefly(state.raw), `${collection.slug}.pagefly`)
          }
          className="bg-pf-bg/80 backdrop-blur"
        >
          Export
        </Button>
      </div>
    </Panel>
    </div>
  );
}

/* ---- the preview ---------------------------------------------------------- */

/**
 * One page, drawn into an isolated document and scrolled by moving it.
 *
 * THE IFRAME IS RENDERED AT A DESKTOP WIDTH AND SCALED DOWN, rather than
 * rendered small. A page laid out at 300px is the page's MOBILE layout, which
 * is not what a merchant is choosing between — they want to see the design.
 * So it is 1280 wide and transformed, which is also why the height is large:
 * the whole page has to exist before there is anything to scroll through.
 */
function PagePreview({
  page,
  scrolling,
  width = 1280,
  shot,
}: {
  page: PageflyPage;
  scrolling: boolean;
  /** the layout width to render at — a real breakpoint, not a thumbnail size */
  width?: number;
  /**
   * A screenshot to show instead of drawing the file.
   *
   * WHEN THERE IS ONE, IT WINS. The renderer in `lib/collections/pagefly.ts` is
   * a good reconstruction; a screenshot is PageFly's own render, with its base
   * stylesheet and a real store behind the product elements — neither of which
   * this app has. The renderer stays as the fallback, so a set added without
   * pictures still works the day it arrives.
   */
  shot?: string | null;
}) {
  const html = useHtml(page);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  /* THE SCALE IS MEASURED, NOT CHOSEN. It was a hardcoded 0.34, which renders a
     1280px page at 435 — into cards about 360 wide. So every preview was
     cropped down its right edge: `Authentic K-bea`, `Up t`, `Seoul-born s`. A
     number that has to agree with a CSS grid is a number that will eventually
     disagree with it, so it is taken from the box itself. */
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = size.w > 0 ? size.w / width : 0;

  /* THE REAL HEIGHT, once a screenshot has loaded.
 
     A fixed 4200 was fine for the iframe, which is a box this app decides the
     size of. A screenshot is not: these run from about 4,000 pixels to 8,200
     depending on the page and the breakpoint — the About page at 390 wide is
     7,131. Scrolling a fixed distance would stop two thirds of the way down a
     tall one and run off the bottom of a short one into blank space. */
  const [shotHeight, setShotHeight] = useState(0);
  const tall = shot && shotHeight > 0 ? shotHeight : 4200;
  /* How far it can move before the bottom is on screen, in the document's own
     pixels, because that is the unit `y` is in. */
  const travel = scale > 0 ? Math.max(0, tall - size.h / scale) : 0;

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      {scale > 0 && (
      <motion.div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width, height: tall, scale }}
        animate={{ y: scrolling ? -travel : 0 }}
        /* Paced by distance rather than fixed, so a short page does not crawl
           and a long one does not race. */
        transition={{ duration: scrolling ? Math.max(4, travel / 260) : 0.5, ease: "linear" }}
      >
        {shot ? (
          /* eslint-disable-next-line @next/next/no-img-element -- a full-page
             screenshot, thousands of pixels tall and a different shape per
             page; next/image wants dimensions this does not have, and there is
             nothing to optimise in an already-sized webp. */
          <img
            src={shot}
            alt={page.label}
            loading="lazy"
            /* Measured from the rendered element rather than from
               `naturalHeight`: the image is laid out at `width`, so what the
               scroll has to travel is the height AT THAT WIDTH. */
            onLoad={(e) => setShotHeight(e.currentTarget.offsetHeight)}
            className="block"
            style={{ width }}
          />
        ) : (
          <iframe
            title={page.label}
            srcDoc={html}
            /* Nothing in these files needs script, and the documents are built
               from a merchant's own export — so the sandbox is empty, which
               denies script, forms, popups and navigation in one attribute. */
            sandbox=""
            scrolling="no"
            className="pointer-events-none size-full border-0"
          />
        )}
      </motion.div>
      )}
    </div>
  );
}

/**
 * Built once per page — 100-170KB of HTML is not something to rebuild on a
 * hover, and a changed `srcDoc` reloads the iframe from scratch.
 *
 * `useMemo` keyed on the page object rather than a ref cache: the parsed pages
 * are stable objects held by `useCollection`, so identity is exactly the right
 * key, and a ref read during render is a render with a side effect.
 */
function useHtml(page: PageflyPage): string {
  return useMemo(() => pageToHtml(page), [page]);
}

/* ---- the set, opened ------------------------------------------------------ */

function CollectionDetail({
  collection,
  onClose,
}: {
  collection: CollectionMeta;
  onClose: () => void;
}) {
  const state = useCollection(collection, true);
  const pages = state.status === "ready" ? state.pages : [];
  const labels = shortenLabels(pages.map((p) => p.label));
  const [viewing, setViewing] = useState<number | null>(null);
  /* Hover scrolls the page here too. It was on the set card and not on these,
     which made the seven read as pictures of pages rather than pages. */
  const [hovering, setHovering] = useState<number | null>(null);

  /* ==========================================================================
     THE APP'S OWN PREVIEW, NOT A SECOND ONE.

     `PreviewOverlay` is where every other page in this product is looked at —
     1440/1280/834/390, zoom, Fit, Scrub, arrow keys, Esc. A viewer built here
     would have been a second set of breakpoints to keep in step with those,
     and a merchant learning two ways to look at a page.

     It takes `PageMockup[]`, and these are .pagefly files with no design tree
     behind them. But the overlay reads only six fields off a page — id, label,
     categoryLabel, copyIndex, copyTotal, variant — and takes the DRAWING from
     `renderPage`. So the shim carries those six honestly and the iframe does
     the rest. */
  const shims = pages.map(
    (page, i) =>
      ({
        id: `${collection.slug}-${i}`,
        label: labels[i] ?? page.label,
        categoryLabel: collection.name,
        copyIndex: i + 1,
        copyTotal: pages.length,
        variant: 0,
      }) as unknown as PageMockup,
  );

  /* Escape closes it, and the listener is on the document because the panel is
     not what has focus after a card click.

     NOT WHILE A PAGE IS OPEN OVER IT. The overlay listens on the document too,
     so one press reached both and closed the page AND the set behind it — a
     merchant who wanted to go back to the seven found themselves back on the
     landing page. Escape should close the top thing, and only that. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && viewing === null) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, viewing]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 overflow-y-auto bg-pf-bg/92 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-auto min-h-full w-full max-w-6xl px-4 py-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-pf-text">
              {collection.name}
            </h3>
            <p className="mt-1 text-[12.5px] text-pf-muted">{collection.blurb}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              icon="Download"
              disabled={state.status !== "ready"}
              onClick={() =>
                state.status === "ready" &&
                download(combinePagefly(state.raw), `${collection.slug}.pagefly`)
              }
            >
              Export all {pages.length > 0 ? `${pages.length} pages` : ""}
            </Button>
            <Button size="sm" variant="ghost" icon="X" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {state.status === "loading" && (
          <p className="mt-10 text-center text-[13px] text-pf-muted">Loading the set…</p>
        )}
        {state.status === "failed" && (
          <p className="mt-10 text-center text-[13px] text-pf-muted">
            This set could not be loaded.
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page, i) => (
            <Panel
              key={page.label}
              className="group overflow-hidden transition-shadow duration-200 hover:border-pf-primary-hi/50 hover:shadow-pf-glow"
            >
              <button
                type="button"
                onClick={() => setViewing(i)}
                onMouseEnter={() => setHovering(i)}
                onMouseLeave={() => setHovering(null)}
                className="relative block aspect-[3/4] w-full bg-pf-bg-deep"
                aria-label={`Open ${labels[i]}`}
              >
                <PagePreview
                  page={page}
                  scrolling={hovering === i}
                  shot={shotFor(collection, page.label, "card")}
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-pf-bg/85 to-transparent pb-2.5 pt-7 text-[11.5px] font-semibold text-pf-text opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <Icon name="Maximize" size={12} />
                  Open
                </span>
              </button>
              <div className="flex items-center justify-between gap-2 border-t border-pf-border px-3 py-2.5">
                <span className="min-w-0 truncate text-[12.5px] font-semibold text-pf-text">
                  {labels[i]}
                </span>
                {/* ONE PAGE, ON ITS OWN. Worth having now that a set is seven
                    files rather than one: a merchant who wants the product
                    page and nothing else used to have to take all seven and
                    import six they did not ask for. `raw[i]` is the file this
                    card is drawing, which is what keeps the button honest. */}
                <Button
                  size="sm"
                  variant="quiet"
                  icon="Download"
                  onClick={() =>
                    state.status === "ready" &&
                    download(
                      state.raw[i],
                      `${collection.slug}-${labels[i].toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pagefly`,
                    )
                  }
                >
                  Export
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      </div>

      {/* ==========================================================================
          PORTALLED TO THE BODY, and it has to be — twice over.

          `position: fixed` is relative to the viewport UNLESS an ancestor
          establishes a containing block, and `backdrop-filter` does. The panel
          around this grid has `backdrop-blur-sm` and scrolls, so the overlay's
          `fixed inset-0` was anchored to a scrolled box rather than to the
          screen: read to the bottom of a page and the overlay went with it,
          showing the grid through and around a frame floating mid-air.

          And the panel closes on click. The overlay was inside it, so every
          press inside the overlay bubbled up and closed the set — which is
          what made the device buttons read as a Close button. A portal does
          not fix that on its own, because React events propagate through the
          React tree rather than the DOM one, so the wrapper stops them.
          ========================================================================== */}
      {viewing !== null &&
        pages[viewing] &&
        /* `document` does not exist during the server render. No mounted flag
           is needed for it: `viewing` starts null and only becomes a number
           from a click, so the server never reaches this branch and there is
           nothing for the client to disagree with. */
        typeof document !== "undefined" &&
        createPortal(
          /* `pfd-root` TRAVELS WITH IT. `styles/reset.css` is this app's
             stand-in for Tailwind Preflight and is scoped to that class on
             purpose — the feature embeds into pagefly.io and must not reset
             their stylesheet. So a portal to `document.body` lands outside it,
             and the overlay came back with `border-style: none` on every
             border Tailwind had given a width to, and browser-default padding
             and background on every button: a toolbar of white pills with
             invisible borders.

             The class rather than portalling into the existing `.pfd-root`
             node, because that one carries `overflow-x-clip` and clipping is
             one of the things that can stop `position: fixed` meaning the
             viewport. The variables themselves are global — `@theme` puts them
             on `:root` — so only the reset had to follow. */
          <div className="pfd-root" onClick={(e) => e.stopPropagation()}>
          <PreviewOverlay
            pages={shims}
            index={viewing}
            readOnly
            /* This screen owns whether the overlay is open, so it has to own
               closing it too — the store's own `closePreview` clears an index
               this component never reads, which made the X and Esc do nothing
               at all. */
            onClose={() => setViewing(null)}
            onStep={(delta) =>
              setViewing((was) =>
                was === null ? was : (was + delta + pages.length) % pages.length,
              )
            }
            renderPage={(_, width) => {
              /* WHICH DEVICE, from the width the overlay handed over. The four
                 screenshots are named for the ids in `lib/generate/types` and
                 the overlay's device list is the same four, so this is a
                 lookup rather than a guess — and if a width ever arrives that
                 is not one of them, the file's own render draws it instead of
                 a broken image. */
              const device = DEVICES.find((d) => d.width === width)?.id;
              const shot = device ? shotFor(collection, pages[viewing].label, device) : null;

              return shot ? (
                /* eslint-disable-next-line @next/next/no-img-element -- a
                   full-page screenshot whose height is different per page and
                   per breakpoint; there is nothing for next/image to optimise
                   in an already-sized webp. */
                <img
                  src={shot}
                  alt={labels[viewing]}
                  style={{ width, display: "block" }}
                />
              ) : (
                <iframe
                  title={labels[viewing]}
                  srcDoc={pageToHtml(pages[viewing])}
                  sandbox=""
                  /* The fallback, for a set with no screenshots. The page's own
                     media queries do the work — `pageToHtml` writes the file's
                     laptop/tablet/mobile keys out as real ones — so narrowing
                     the frame runs its actual responsive rules.

                     Tall and fixed because the overlay's container is what
                     scrolls, and an iframe cannot size itself to its content
                     across a document boundary. */
                  style={{ width, height: 5200, border: 0, display: "block" }}
                />
              );
            }}
          />
          </div>,
          document.body,
        )}
    </motion.div>
  );
}
