"use client";

import { AnimatePresence, MotionConfig } from "framer-motion";
import { useEffect } from "react";
import { useStore, useVisiblePages } from "@/lib/store";
import type { Account } from "@/lib/account";
import { AccountProvider } from "./AccountProvider";
import { RunRecorder } from "./RunRecorder";
import { ReviewPrompt } from "./review/ReviewPrompt";
import { BriefScreen } from "./brief/BriefScreen";
import { GeneratingScreen } from "./generating/GeneratingScreen";
import { PreviewOverlay } from "./preview/PreviewOverlay";
import { ExportProvider } from "./results/ExportProvider";
import { ResultsScreen } from "./results/ResultsScreen";
import { ProgressSteps } from "./ProgressSteps";

/* ==========================================================================
   PageFly Design.

   Everything lives under `.pfd-root` so the whole feature can be dropped into
   pagefly.io without leaking a single global style. See README for the embed
   steps.
   ========================================================================== */

function Screens() {
  const screen = useStore((s) => s.screen);
  const previewIndex = useStore((s) => s.previewIndex);
  const openPreview = useStore((s) => s.openPreview);
  const visible = useVisiblePages();

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {screen === "brief" && <BriefScreen key="brief" />}
        {screen === "generating" && <GeneratingScreen key="generating" />}
        {screen === "results" && (
          <ResultsScreen key="results" onOpen={openPreview} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewIndex !== null && visible[previewIndex] && (
          <PreviewOverlay pages={visible} index={previewIndex} />
        )}
      </AnimatePresence>
    </>
  );
}

export function DesignApp({ account }: { account: Account | null }) {
  const setFailFirstN = useStore((s) => s.setFailFirstN);
  const editBrief = useStore((s) => s.editBrief);

  /* Design always opens on the brief, ready to build again.
     The store outlives client-side navigation, so coming back from the Library
     used to land on the previous run's results — the merchant had to hunt for a
     way back to the form to build anything new. Finished work lives in the
     Library now, so there is nothing here worth returning to. The draft is kept,
     so the last brief is still filled in. */
  useEffect(() => {
    if (useStore.getState().screen === "results") editBrief();
  }, [editBrief]);

  /* Dev-only escape hatch so the partial-failure and retry paths can be seen
     without waiting for a real generator error: /design?pfd-fail=2 */
  useEffect(() => {
    const n = Number(
      new URLSearchParams(window.location.search).get("pfd-fail") ?? 0,
    );
    if (Number.isFinite(n) && n > 0) setFailFirstN(n);
  }, [setFailFirstN]);

  /* Reference images are object URLs. Release them when the feature unmounts
     so a long-lived host page doesn't hold the blobs forever. */
  useEffect(() => {
    return () => {
      for (const img of useStore.getState().draft.referenceImages) {
        URL.revokeObjectURL(img.url);
      }
    };
  }, []);

  return (
    /* reducedMotion="user" is load-bearing for accessibility. Framer Motion
       animates with JS, not CSS transitions, so the `prefers-reduced-motion`
       block in tokens.css cannot reach it — this is what actually turns
       transform and layout animation into instant opacity changes across the
       whole feature. Individual components additionally read useReducedMotion()
       where they own a long-running or looping animation. */
    <MotionConfig reducedMotion="user">
     <AccountProvider account={account}>
      {/* translate="no" + notranslate is a functional requirement, not a
          preference. Google Translate rewrites text nodes into <font> wrappers
          before React hydrates; the tree then fails to match, event handlers
          never attach, and every control in the form silently stops responding.
          It also has nothing useful to do here — the mockup copy is design
          content, and machine-translating a design preview corrupts the thing
          being previewed. Both the attribute and the class are set because
          Chrome honours them inconsistently on their own. */}
      <div
        translate="no"
        className="notranslate pfd-root relative min-h-screen overflow-x-clip"
      >
        <div aria-hidden className="pfd-glow absolute inset-x-0 top-0 h-[720px]" />
        <div aria-hidden className="pfd-grid absolute inset-x-0 top-0 h-[720px]" />

        <div className="relative mx-auto w-full max-w-[1600px] px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
          <ProgressSteps />
          <div className="pt-2">
            <ExportProvider>
              <Screens />
            </ExportProvider>
          </div>
          <RunRecorder />
          <ReviewPrompt />
        </div>
      </div>
     </AccountProvider>
    </MotionConfig>
  );
}
