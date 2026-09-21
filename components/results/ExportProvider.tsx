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
import { designTreeSchema, type DesignTree } from "@/lib/design/schema";
import { pageflyFromTree } from "@/lib/design/toPagefly";
import { MockupPage } from "../mockup/MockupPage";

/* ==========================================================================
   PNG export.

   Pages are exported by mounting them off-screen at a full device width and
   capturing that node — never by upscaling the cropped card, which would ship
   a blurry image of a thumbnail.
   ========================================================================== */

type ExportState = {
  exporting: boolean;
  /** "3 of 8" while a batch runs */
  progress: string | null;
  error: string | null;
  exportOne: (page: PageMockup) => Promise<void>;
  exportAll: (pages: PageMockup[]) => Promise<void>;
  /** .pagefly import file for one page */
  exportPagefly: (page: PageMockup) => Promise<void>;
  /** one .pagefly per page, downloaded in sequence */
  exportPageflyAll: (pages: PageMockup[]) => Promise<void>;
  /**
   * Start converting these pages now, so the Export click has nothing to wait
   * for. Safe to call on every render: a page already converting or converted
   * is not converted again.
   */
  prepare: (pages: PageMockup[]) => void;
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
const prepared = createPreparer<{ page: PageMockup; html: string }, Built | null>(
  ({ page, html }) => pageflyFromHtmlViaSkill(page, html),
);

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
  const [staged, setStaged] = useState<PageMockup | null>(null);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
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
      /* COLLECTED, NOT STARTED. If `prepare` has already run this document the
         file is here; if it is still running, this joins that one rather than
         racing a second conversion for the same download; and if nothing
         started it — a page opened straight from the Library, say — this is
         the first ask and behaves exactly as the click always did. */
      const built = await prepared
        .start(keyForHtml(page.id, html), { page, html })
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
  }, []);

  const exportPagefly = useCallback(
    async (page: PageMockup) => {
      setExporting(true);
      setError(null);
      try {
        await buildPagefly(page);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Couldn't build the .pagefly file: ${err.message}`
            : "Couldn't build the .pagefly file.",
        );
      } finally {
        setStaged(null);
        setExporting(false);
      }
    },
    [buildPagefly],
  );

  const exportPageflyAll = useCallback(
    async (pages: PageMockup[]) => {
      setExporting(true);
      setError(null);
      const failed: string[] = [];
      try {
        for (let i = 0; i < pages.length; i++) {
          setProgress(`${i + 1} of ${pages.length}`);
          try {
            await buildPagefly(pages[i]);
          } catch {
            failed.push(pages[i].label);
          }
        }
        if (failed.length) {
          setError(
            `${failed.length} of ${pages.length} page${failed.length === 1 ? "" : "s"} wouldn't export (${failed.join(", ")}). The rest downloaded.`,
          );
        }
      } finally {
        setStaged(null);
        setProgress(null);
        setExporting(false);
      }
    },
    [buildPagefly],
  );

  const exportOne = useCallback(
    async (page: PageMockup) => {
      setExporting(true);
      setError(null);
      try {
        await capture(page);
      } catch {
        setError("That page wouldn't export. Try again, or download it from the preview.");
      } finally {
        setStaged(null);
        setExporting(false);
      }
    },
    [capture],
  );

  const exportAll = useCallback(
    async (pages: PageMockup[]) => {
      setExporting(true);
      setError(null);
      let failed = 0;
      try {
        for (let i = 0; i < pages.length; i++) {
          setProgress(`${i + 1} of ${pages.length}`);
          try {
            await capture(pages[i]);
          } catch {
            failed += 1;
          }
        }
        if (failed > 0) {
          setError(
            `${failed} of ${pages.length} page${failed === 1 ? "" : "s"} wouldn't export. The rest downloaded.`,
          );
        }
      } finally {
        setStaged(null);
        setProgress(null);
        setExporting(false);
      }
    },
    [capture],
  );

  /* Fire and forget: the promise is the preparer's to hold, and a failure here
     is not the merchant's problem yet — the export click falls back to the
     measuring converter, which is what it did before any of this existed. */
  const prepare = useCallback((pages: PageMockup[]) => {
    for (const page of pages) {
      const html = htmlOf(page);
      if (html === null) continue;
      void prepared.start(keyForHtml(page.id, html), { page, html }).catch(() => undefined);
    }
  }, []);

  const value = useMemo<ExportState>(
    () => ({
      exporting,
      progress,
      error,
      exportOne,
      exportAll,
      exportPagefly,
      exportPageflyAll,
      prepare,
      clearError: () => setError(null),
    }),
    [
      exporting,
      progress,
      error,
      exportOne,
      exportAll,
      exportPagefly,
      exportPageflyAll,
      prepare,
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
