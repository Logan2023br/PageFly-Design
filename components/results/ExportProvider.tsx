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
import { pageFromDom } from "@/lib/pagefly/fromDom";
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

export function ExportProvider({ children }: { children: ReactNode }) {
  const [staged, setStaged] = useState<PageMockup | null>(null);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

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
    await nextPaint();
    const node = stageRef.current;
    if (!node) throw new Error("Export surface not ready");
    const { blob, filename } = pageFromDom(node, page, EXPORT_WIDTH);
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
        <div ref={stageRef} style={{ width: EXPORT_WIDTH }}>
          {staged && <MockupPage page={staged} width={EXPORT_WIDTH} />}
        </div>
      </div>
    </Ctx.Provider>
  );
}
