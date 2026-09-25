"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PageMockup } from "@/lib/generate/types";
import { captureNode, downloadDataUrl, nextPaint, slugify } from "@/lib/png";
import { downloadBlob } from "@/lib/pagefly/builder";
import { announceExport } from "@/lib/pagefly/install";
import { fileStem, pageFromBreakpoints, type Rendered } from "@/lib/pagefly/fromDom";
import { createPreparer, keyForHtml } from "@/lib/pagefly/prepared";
import { ownPageId } from "@/lib/pagefly/pageId";
import { createExportQueue } from "./exportQueue";
import { designTreeSchema, type DesignTree } from "@/lib/design/schema";
import { pageflyFromTree } from "@/lib/design/toPagefly";
import { MockupPage } from "../mockup/MockupPage";
import { useAdminDomain } from "./adminView";

/* ==========================================================================
   PNG export.

   Pages are exported by mounting them off-screen at a full device width and
   capturing that node — never by upscaling the cropped card, which would ship
   a blurry image of a thumbnail.
   ========================================================================== */

type ExportState = {
  exporting: boolean;
  /**
   * Every page waiting to be exported, in the order it was asked for.
   *
   * THE HEAD IS THE ONE RUNNING. A job is shifted off only once it has
   * finished, so `queue[0]` is in progress and the rest are waiting — see
   * `placeOf` in `./exportLabel`.
   *
   * IT REPLACED A SINGLE `exportingId`, which could only describe one press.
   * With one id, a second click had nowhere to be recorded, so the screen
   * refused it: every other card stayed disabled until the first finished.
   */
  queue: string[];
  /** "3 of 8" while a batch runs */
  progress: string | null;
  error: string | null;
  exportOne: (page: PageMockup) => Promise<void>;
  exportAll: (pages: PageMockup[]) => Promise<void>;
  /** .pagefly import file for one page */
  exportPagefly: (page: PageMockup) => Promise<void>;
  /** one .pagefly per page, downloaded in sequence */
  exportPageflyAll: (pages: PageMockup[]) => Promise<void>;
  clearError: () => void;
};

const Ctx = createContext<ExportState | null>(null);

export function useExport(): ExportState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useExport must be used inside <ExportProvider>");
  return ctx;
}

/**
 * The same, for a screen where exporting is not on offer.
 *
 * The preview overlay is shared between the signed-in results grid and the
 * public front door. Signed in it sits inside an `ExportProvider`; on the front
 * door there is no provider and no reason for one — the PNG button is hidden
 * there because a visitor has no account to export into. `useExport` throws in
 * that case, which would take the whole landing page down over a button nobody
 * can see.
 *
 * Null rather than a stub that silently does nothing: a caller has to notice
 * it is absent, which is the difference between "no export here" and "export
 * quietly broken".
 */
export function useExportOptional(): ExportState | null {
  return useContext(Ctx);
}

/**
 * Ask the server to convert the document with the `pagefly-builder` skill.
 *
 * Returns null when the route is unavailable or answers badly, so the caller
 * falls back to the converter that needs no model at all. A merchant who has
 * waited for a build should get a file, not an apology, even on the day the
 * vendor is down.
 */
type Built = { blob: Blob; filename: string };

async function pageflyFromHtmlViaSkill(
  page: PageMockup,
  html: string,
  /** An operator's store, so the built file is filed under it rather than
      thrown away — see `lib/pagefly/fileScope.ts`. Null for a merchant, whose
      own session already says which store this is. */
  domain: string | null,
): Promise<Built | null> {
  const name = fileStem(page);
  try {
    const res = await fetch("/api/pagefly/from-html", {
      method: "POST",
      headers: { "content-type": "application/json" },
      /* The page's own palette travels with it: the converter writes the
         wrapper's background, ink and face from these, and PageFly Design's
         tokens would repaint a document that already chose its own. */
      body: JSON.stringify({
        html,
        name,
        /* Both are for STORING the answer, not for making it. Without them the
           route converts and discards, which is how every export here cost a
           fresh two minutes of model time. */
        /* The page's OWN id — the Library prefixes it with the run, and
           `prebuild` filed the answer under the plain one. */
        pageId: ownPageId(page),
        ...(domain ? { domain } : {}),
        bg: page.tokens.bg,
        ink: page.tokens.ink,
        fontBody: page.tokens.fontBody,
        accent: page.tokens.accent,
        border: page.tokens.border,
        radius: page.tokens.radius,
        band: page.tokens.surfaceAlt,
      }),
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    return { blob, filename: `${name}.pagefly` };
  } catch {
    return null;
  }
}

const EXPORT_WIDTH = 1440;

/* ==========================================================================
   THE FILE IS BUILT WHILE THE MERCHANT IS STILL READING THE MOCKUP.

   One conversion per document, started when the page appears and collected by
   the click — see `lib/pagefly/prepared.ts` for the four rules it keeps and
   why each of them is a bug if a component tries to keep it instead.

   Module scope rather than a ref: the results screen unmounts when a merchant
   opens the preview overlay and mounts again when they close it, and work
   thrown away on the way through is a minute the merchant pays for twice.
   ========================================================================== */
const prepared = createPreparer<
  { page: PageMockup; html: string; domain: string | null },
  Built | null
>(({ page, html, domain }) => pageflyFromHtmlViaSkill(page, html, domain));

/**
 * The file this page was already converted into, when the server has it.
 *
 * THE USUAL ANSWER, not an optimisation. A deck's files are built once when the
 * deck is saved, so by the time a merchant is looking at their pages the file
 * is normally sitting there and the click costs a download. Null means "not
 * yet" — the build may still be running, or it may have failed — and the caller
 * converts on demand, which is what every click did before this existed.
 */
async function storedPagefly(
  page: PageMockup,
  html: string,
  domain: string | null,
): Promise<Built | null> {
  try {
    const res = await fetch(
      `/api/pagefly/file?key=${encodeURIComponent(keyForHtml(ownPageId(page), html))}` +
        /* An operator has no merchant session, so without this the lookup is
           a 401 and every click reconverts. */
        (domain ? `&domain=${encodeURIComponent(domain)}` : ""),
    );
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    return { blob, filename: `${fileStem(page)}.pagefly` };
  } catch {
    return null;
  }
}

/** The document a page will be converted from, when it has one. */
function htmlOf(page: PageMockup): string | null {
  const html = page.design?.html;
  return typeof html === "string" && html.trim() !== "" ? html : null;
}

/* Every breakpoint the mockup supports, mapped to the keys PageFly styles
   against. All four are mounted at once rather than one at a time: the layout
   custom properties are MEASURED from the laid-out element, and a render that has
   been swapped out — or cloned detached — measures zero. */
const EXPORT_BREAKPOINTS = [
  { key: "all" as const, width: 1440 },
  { key: "laptop" as const, width: 1280 },
  { key: "tablet" as const, width: 834 },
  { key: "mobile" as const, width: 390 },
];

/**
 * The tree on a page, validated. Same guard as the renderer uses: a deck
 * reopened from the Library has been through a database and is `unknown` until
 * it is checked, and anything that fails falls back to the DOM walk.
 */
function designTreeOf(page: PageMockup): DesignTree | null {
  if (!page.design?.tree) return null;
  const parsed = designTreeSchema.safeParse(page.design.tree);
  return parsed.success ? parsed.data : null;
}

/** The rendered <svg> for one icon name, lifted off the staged mockup. */
function iconMarkup(stage: HTMLElement | null, name: string): string | null {
  if (!stage) return null;
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  const host = stage.querySelector(`[data-icon="${key}"] svg`);
  return host ? host.outerHTML : null;
}

export function ExportProvider({ children }: { children: ReactNode }) {
  /* NULL FOR A MERCHANT, whose own session already says which store this is.
     An operator has no merchant session, so without this every stored file
     lookup is a 401 and every export reconverts from scratch. */
  const adminDomain = useAdminDomain();
  const [staged, setStaged] = useState<PageMockup | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  /* ==========================================================================
     ONE WORKER, A QUEUE IN FRONT OF IT — see `./exportQueue.ts`, which holds
     the rules and the reasoning and is tested on its own.

     HELD IN A REF, NOT BUILT EACH RENDER. The queue IS the in-flight work; a
     new one per render would strand every job already in it, and the screen
     polls. `useState` with an initialiser rather than `useRef(create(...))` so
     the factory runs once rather than on every render and has its result
     thrown away.

     `setQueue` is the mirror the cards render from; the queue itself is the
     truth. A second press in the same tick reads the queue's own list
     synchronously, so it cannot be lost to a stale render value.
     ========================================================================== */
  const [queue, setQueue] = useState<string[]>([]);
  const [jobs] = useState(() =>
    createExportQueue(
      (ids) => setQueue(ids),
      /* The staged node is shared, so it is cleared when the LAST job is done
         and not after each one — clearing between two queued exports would
         unmount the surface the next one is about to measure. */
      () => setStaged(null),
    ),
  );

  const enqueue = useCallback(
    (id: string, work: () => Promise<void>) => jobs.add(id, work),
    [jobs],
  );

  /* Kept for the two batch buttons, which must stay disabled while anything is
     in flight: they walk every visible page and would interleave with a queue
     they did not start. A single card no longer reads this. */
  const exporting = queue.length > 0;
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /* One ref per breakpoint, in EXPORT_BREAKPOINTS order. */
  const bpRefs = useRef<(HTMLDivElement | null)[]>([]);

  const capture = useCallback(async (page: PageMockup) => {
    setStaged(page);
    await nextPaint();
    // A second wait lets the mockup's own layout settle at export width.
    await nextPaint();
    const node = stageRef.current;
    if (!node) throw new Error("Export surface not ready");
    const dataUrl = await captureNode(node, page.tokens.bg);
    const suffix = page.copyTotal && page.copyTotal > 1 ? `-${page.copyIndex}` : "";
    downloadDataUrl(dataUrl, `${slugify(page.label)}${suffix}.png`);
  }, []);

  /* Same staged render the PNG capture uses. The DOM it produces already holds
     the exact inline CSS that drew the mockup, so the export copies rather than
     re-derives it — see lib/pagefly/fromDom.ts. */
  const buildPagefly = useCallback(async (page: PageMockup) => {
    setStaged(page);
    await nextPaint();
    // A second wait lets every breakpoint's layout settle before it is measured.
    await nextPaint();

    /* A page the model designed already states every breakpoint explicitly, so
       there is nothing to measure — the file comes straight off the tree. The
       staged render is still used, but only to lift the icon artwork. */
    const tree = designTreeOf(page);
    if (tree) {
      const { blob, filename } = pageflyFromTree(
        tree,
        {
          name: fileStem(page),
          bg: page.tokens.bg,
          ink: page.tokens.ink,
          fontBody: page.tokens.fontBody,
        },
        EXPORT_WIDTH,
        {
          images: page.design?.images ?? {},
          videos: page.design?.videos ?? {},
          /* Two composites the platform leaves unstyled: Form2's submit button
             arrives as a grey native control, and the buy button used to be
             emitted as a hard-coded near-black — invisible on a dark page, and
             the wrong colour on every page that has an accent. */
          accent: page.tokens.accent,
          border: page.tokens.border,
          radius: page.tokens.radius,
          band: page.tokens.surfaceAlt,
          iconSvg: (name) => iconMarkup(stageRef.current, name),
        },
      );
      downloadBlob(blob, filename);
      /* AFTER the file is handed over, never before. The install notice says
         "your file is downloading"; firing it on the attempt would say that
         about a build that then threw. */
      announceExport();
      return;
    }

    /* A PAGE WRITTEN AS HTML IS LAID OUT ELSEWHERE.

       Everything below reads the staged React render, and in HTML mockup mode
       there is nothing there to read but an iframe — the document has its own
       stylesheet and its own media queries, so it has to be laid out as a
       document, at each width, before anything can be measured off it. */
    const html = htmlOf(page);
    if (html !== null) {
      /* TWO CONVERTERS, AND THE SKILL ONE IS ON.

         `lib/pagefly/fromHtml.ts` lays the document out in four hidden frames
         and writes PageFly nodes from what the browser measured. It is exact
         about pixels and knows about PageFly only what `builder.ts` was taught
         one import bug at a time.

         The route below hands the `pagefly-builder` skill — 99 element types
         with their verified shapes, every field, every legal nesting — to the
         model that already wrote the page, and lets it choose the elements. The
         measuring converter is not deleted and nothing about it has changed;
         set `PAGEFLY_FROM_HTML=measure` to go back to it. */
      /* THE STORED FILE FIRST, and it is normally there: the deck's files are
         built once on the server when the deck is saved, and kept. This is a
         download, not a conversion — no model call, no minute of waiting, and
         no second bill for a page that has already been converted. */
      const ready = await storedPagefly(page, html, adminDomain);
      if (ready) {
        downloadBlob(ready.blob, ready.filename);
        announceExport();
        return;
      }

      /* NOT THERE YET, so convert now. The deck's own conversion may still be
         running, or it may have failed; either way the merchant asked for this
         file and gets it. `prepared` keeps a second click from racing a second
         conversion of the same document. */
      const built = await prepared
        .start(keyForHtml(ownPageId(page), html), { page, html, domain: adminDomain }, { now: true })
        .catch(() => null);
      if (built) {
        downloadBlob(built.blob, built.filename);
        announceExport();
        return;
      }

      const { pageflyFromHtml } = await import("@/lib/pagefly/fromHtml");
      const fallback = await pageflyFromHtml(html, page, EXPORT_WIDTH);
      downloadBlob(fallback.blob, fallback.filename);
      announceExport();
      return;
    }

    const renders: Rendered[] = [];
    EXPORT_BREAKPOINTS.forEach((bp, i) => {
      const node = bpRefs.current[i];
      if (node) renders.push({ key: bp.key, root: node });
    });
    if (renders.length === 0) throw new Error("Export surface not ready");

    const { blob, filename } = pageFromBreakpoints(renders, page, EXPORT_WIDTH);
    downloadBlob(blob, filename);
    announceExport();
    /* `adminDomain` decides both the lookup and where the result is filed. */
  }, [adminDomain]);

  const exportPagefly = useCallback(
    (page: PageMockup) =>
      /* QUEUED, NOT RUN. The press is always accepted; the work waits its turn.
         The promise settles when THIS page's file is built, which is what the
         card awaits to choose between "Exported" and "Export failed".

         NOTE THE RETHROW. The card reports its own outcome, so the error has
         to reach it; the banner below is for the merchant who is not watching
         that card. Swallowing it here left every failed export labelled
         "Exported". */
      enqueue(page.id, async () => {
        setError(null);
        try {
          await buildPagefly(page);
        } catch (err) {
          setError(
            err instanceof Error
              ? `Couldn't build the .pagefly file: ${err.message}`
              : "Couldn't build the .pagefly file.",
          );
          throw err;
        }
      }),
    [buildPagefly, enqueue],
  );

  /* ==========================================================================
     THE BATCH IS THE QUEUE, FILLED IN ONE PRESS.

     It used to walk the pages itself, awaiting `buildPagefly` in a loop. That
     loop and the single-card queue would now be two workers over one staging
     node — the exact collision the queue exists to prevent — and a merchant
     who pressed Export all while one card was still converting would get two
     pages measured into each other.

     So it queues every page and waits for them, and the order falls out of the
     queue rather than out of this function: anything already pressed runs
     first, which is what was asked for.

     PROGRESS IS COUNTED FROM COMPLETIONS, not from a loop index, because there
     is no longer a loop here to be the index of.
     ========================================================================== */
  const exportPageflyAll = useCallback(
    async (pages: PageMockup[]) => {
      setError(null);
      const failed: string[] = [];
      let done = 0;
      setProgress(`0 of ${pages.length}`);
      await Promise.all(
        pages.map((page) =>
          enqueue(page.id, () => buildPagefly(page))
            .catch(() => {
              failed.push(page.label);
            })
            .finally(() => {
              done += 1;
              setProgress(`${done} of ${pages.length}`);
            }),
        ),
      );
      setProgress(null);
      if (failed.length)
        setError(
          `${failed.length} of ${pages.length} page${failed.length === 1 ? "" : "s"} wouldn't export (${failed.join(", ")}). The rest downloaded.`,
        );
    },
    [buildPagefly, enqueue],
  );

  const exportOne = useCallback(
    (page: PageMockup) =>
      /* THE SAME QUEUE AS THE .pagefly EXPORTS, on purpose: a PNG capture
         stages into the same single node, so the two kinds of export cannot
         run beside each other any more than two of one kind can. */
      enqueue(page.id, async () => {
        setError(null);
        try {
          await capture(page);
        } catch (err) {
          setError("That page wouldn't export. Try again, or download it from the preview.");
          throw err;
        }
      }),
    [capture, enqueue],
  );

  /** The PNG batch, through the same queue and for the same reason. */
  const exportAll = useCallback(
    async (pages: PageMockup[]) => {
      setError(null);
      let failed = 0;
      let done = 0;
      setProgress(`0 of ${pages.length}`);
      await Promise.all(
        pages.map((page) =>
          enqueue(page.id, () => capture(page))
            .catch(() => {
              failed += 1;
            })
            .finally(() => {
              done += 1;
              setProgress(`${done} of ${pages.length}`);
            }),
        ),
      );
      setProgress(null);
      if (failed > 0)
        setError(
          `${failed} of ${pages.length} page${failed === 1 ? "" : "s"} wouldn't export. The rest downloaded.`,
        );
    },
    [capture, enqueue],
  );

  const value = useMemo<ExportState>(
    () => ({
      exporting,
      queue,
      progress,
      error,
      exportOne,
      exportAll,
      exportPagefly,
      exportPageflyAll,
      clearError: () => setError(null),
    }),
    [
      exporting,
      queue,
      progress,
      error,
      exportOne,
      exportAll,
      exportPagefly,
      exportPageflyAll,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* Off-screen export surface. Kept in the layout (not display:none) so
          the mockup actually lays out; parked far off-canvas instead. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: -100000,
          width: EXPORT_WIDTH,
          pointerEvents: "none",
          opacity: 0,
          zIndex: -1,
        }}
      >
        {/* Desktop first — the PNG capture points at this one. */}
        <div ref={stageRef} style={{ width: EXPORT_WIDTH }}>
          {staged && <MockupPage page={staged} width={EXPORT_WIDTH} />}
        </div>

        {/* The other breakpoints, mounted alongside so each is laid out at its
            own width and can be measured. Only the .pagefly export reads them. */}
        {EXPORT_BREAKPOINTS.map((bp, i) => (
          <div
            key={bp.key}
            ref={(node) => {
              bpRefs.current[i] = bp.key === "all" ? stageRef.current : node;
            }}
            style={{ width: bp.width }}
          >
            {staged && bp.key !== "all" && (
              <MockupPage page={staged} width={bp.width} />
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
