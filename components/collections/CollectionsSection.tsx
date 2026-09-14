"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { COLLECTIONS, shortenLabels, type CollectionMeta } from "@/lib/collections";
import { pageToHtml, readPageflySet, type PageflyPage } from "@/lib/collections/pagefly";
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
  | { status: "ready"; pages: PageflyPage[]; bytes: Uint8Array }
  | { status: "failed" };

/**
 * Fetch and parse a set, once, and not before it is wanted.
 *
 * The bytes are kept alongside the parsed pages because Export hands over the
 * FILE — the same bytes that drew the preview, so what a merchant sees and
 * what they download cannot be different things.
 */
function useCollection(file: string, wanted: boolean): SetState {
  const [state, setState] = useState<SetState>({ status: "idle" });
  const started = useRef(false);

  useEffect(() => {
    if (!wanted || started.current) return;
    started.current = true;
    setState({ status: "loading" });

    let live = true;
    void (async () => {
      try {
        const res = await fetch(file);
        if (!res.ok) throw new Error(String(res.status));
        const bytes = new Uint8Array(await res.arrayBuffer());
        const pages = readPageflySet(bytes);
        if (live) setState({ status: "ready", pages, bytes });
      } catch {
        /* A card that says nothing is better than one that says the set is
           broken: the merchant did not ask for this and cannot act on it. */
        if (live) setState({ status: "failed" });
      }
    })();

    return () => {
      live = false;
    };
  }, [file, wanted]);

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

  const state = useCollection(collection.file, seen);
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
            <PagePreview page={cover} scrolling={hovered && !reduced} />
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
            state.status === "ready" && download(state.bytes, `${collection.slug}.pagefly`)
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
function PagePreview({ page, scrolling }: { page: PageflyPage; scrolling: boolean }) {
  const html = useHtml(page);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: 1280, height: 3600, transform: "scale(0.34)" }}
        animate={{ y: scrolling ? -1800 : 0 }}
        transition={{ duration: scrolling ? 7 : 0.5, ease: "linear" }}
      >
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
      </motion.div>
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
  const state = useCollection(collection.file, true);
  const pages = state.status === "ready" ? state.pages : [];
  const labels = shortenLabels(pages.map((p) => p.label));

  /* Escape closes it, and the listener is on the document because the panel is
     not what has focus after a card click. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
                download(state.bytes, `${collection.slug}.pagefly`)
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
            <Panel key={page.label} className="overflow-hidden">
              <div className="relative aspect-[3/4] bg-pf-bg-deep">
                <PagePreview page={page} scrolling={false} />
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-pf-border px-3 py-2.5">
                <span className="min-w-0 truncate text-[12.5px] font-semibold text-pf-text">
                  {labels[i]}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-pf-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
