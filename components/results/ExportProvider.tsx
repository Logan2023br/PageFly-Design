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
import { fileStem, pageFromBreakpoints, type Rendered } from "@/lib/pagefly/fromDom";
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
  clearError: () => void;
};

const Ctx = createContext<ExportState | null>(null);

export function useExport(): ExportState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useExport must be used inside <ExportProvider>");
  return ctx;
}

const EXPORT_WIDTH = 1440;

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
          /* Form2's submit button is unstyled by default — a grey native
             control on an otherwise designed page. */
          accent: page.tokens.accent,
          border: page.tokens.border,
          iconSvg: (name) => iconMarkup(stageRef.current, name),
        },
      );
      downloadBlob(blob, filename);
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

  const value = useMemo<ExportState>(
    () => ({
      exporting,
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
