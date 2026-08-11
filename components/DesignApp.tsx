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
  const resumeBuild = useStore((s) => s.resumeBuild);
  const setDevice = useStore((s) => s.setDevice);

  /* Preview a phone on a phone.
     
     The default is Desktop, which is right at a desk and unreadable in a hand:
     a 1440px mockup shown on a 390px screen is a quarter size before anyone
     has done anything, so the first act on opening a preview was always to
     zoom. Set once, on mount, and only when the screen is genuinely small —
     it is a default, not a lock, and the device buttons still win. */
  useEffect(() => {
    if (window.innerWidth < 640) setDevice("mobile");
  }, [setDevice]);

  /* Rejoin a build this store already has running.
     
     This is what makes a reload harmless. The work is on the server, so an
     unfinished build is not lost by closing the tab — but nothing would go
     looking for it either, and the merchant would land on an empty brief while
     their pages finished somewhere they could not see. Signed out, there is
     nothing to rejoin and the call answers 401 without disturbing anything. */
  useEffect(() => {
    if (!account) return;
    void resumeBuild();
  }, [account, resumeBuild]);

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
