"use client";

import { AnimatePresence, MotionConfig } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { Account } from "@/lib/account";
import type { Brief } from "@/lib/validation";
import type { PageMockup } from "@/lib/generate/types";
import { decodeRunPayload } from "@/lib/runPayload";
import { useStore, useVisiblePages, usePreviewDefaults } from "@/lib/store";
import type { RunSummary } from "@/app/api/runs/route";
import { AccountProvider } from "../AccountProvider";
import { GeneratingScreen } from "../generating/GeneratingScreen";
import { PreviewOverlay } from "../preview/PreviewOverlay";
import { ExportProvider } from "../results/ExportProvider";
import { ResultsScreen } from "../results/ResultsScreen";
import { PageQuota, WorkspaceNav } from "../ProgressSteps";
import { ReviewPrompt } from "../review/ReviewPrompt";
import { StoreMenu } from "../StoreMenu";
import { Button, Icon, Panel } from "../ui";

/* ==========================================================================
   Library — every page this store has built.

   It shows the PAGES, not a list of builds. Two builds of three and two pages are
   five pages, and five page thumbnails is what a merchant came to look at; making
   them open a build first to see anything was the wrong shape.

   Each run is replayed through the same generator with its saved brief and variant
   numbers, which reproduces exactly the pages that were saved (see
   lib/runPayload.ts). The deck then goes to the SAME results screen the Design flow
   uses, so preview, device sizes, PNG and .pagefly export behave identically
   wherever a page is opened from.
   ========================================================================== */

type Deck = {
  id: string;
  brief: Brief;
  variants: Record<string, number>;
  snapshot?: PageMockup[] | null;
};

/** A snapshot comes back from the database as `unknown`. It renders directly, so
    it is checked for the shape the renderer needs before being trusted — a run
    written by an older version, or a truncated row, falls back to a replay rather
    than crashing the page it is meant to show. */
function usableSnapshot(value: unknown): PageMockup[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ok = value.every((p) => {
    const page = p as Partial<PageMockup>;
    return (
      page !== null &&
      typeof page === "object" &&
      typeof page.id === "string" &&
      Array.isArray(page.blocks) &&
      page.tokens !== undefined
    );
  });
  return ok ? (value as PageMockup[]) : null;
}

export function LibraryContent({
  runs,
  ownerLabel,
}: {
  runs: RunSummary[];
  ownerLabel?: string;
}) {
  const loadLibrary = useStore((s) => s.loadLibrary);
  /* The Library is its own route with its own preview, so it needs these too —
     without them opening a saved page on a phone landed at Fit. */
  usePreviewDefaults();
  const screen = useStore((s) => s.screen);

  /* Decoded once, in the order the API returned (newest first), so the most
     recent pages are the first ones on screen. */
  const { decks, unreadable } = useMemo(() => {
    const out: Deck[] = [];
    let bad = 0;
    for (const run of runs) {
      const decoded = decodeRunPayload(run.payload);
      if (!decoded.ok) {
        bad++;
        continue;
      }
      out.push({
        id: run.id,
        brief: decoded.payload.brief,
        variants: decoded.payload.variants,
        snapshot: usableSnapshot(run.snapshot),
      });
    }
    return { decks: out, unreadable: bad };
  }, [runs]);

  /* Rebuilt on mount. Nothing is set synchronously here: setting state inside an
     effect cascades a render, and none of this needs to happen before the first
     paint. */
  useEffect(() => {
    if (decks.length === 0) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) await loadLibrary(decks);
    })();
    return () => {
      cancelled = true;
    };
  }, [decks, loadLibrary]);

  if (runs.length === 0) return <EmptyLibrary ownerLabel={ownerLabel} />;

  return (
    <>
      {unreadable > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-pf-md border border-pf-warn/35 bg-pf-warn/10 px-3 py-2 text-[12px] font-semibold text-pf-warn">
          <Icon name="TriangleAlert" size={13} />
          {unreadable} saved build{unreadable === 1 ? "" : "s"} could not be read by
          this version and {unreadable === 1 ? "is" : "are"} not shown.
        </p>
      )}
      <ExportProvider>
        <DeckView building={screen === "generating"} />
      </ExportProvider>
    </>
  );
}

function DeckView({ building }: { building: boolean }) {
  const previewIndex = useStore((s) => s.previewIndex);
  const openPreview = useStore((s) => s.openPreview);
  const visible = useVisiblePages();

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {building && visible.length === 0 ? (
          <GeneratingScreen key="generating" />
        ) : (
          <ResultsScreen key="results" onOpen={openPreview} readOnly />
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

function EmptyLibrary({ ownerLabel }: { ownerLabel?: string }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <Panel className="grid place-items-center gap-3 px-6 py-16 text-center">
      <span className="grid size-10 place-items-center rounded-pf-md border border-pf-border text-pf-faint">
        <Icon name="Library" size={18} />
      </span>
      <p className="text-[13.5px] text-pf-muted">
        {ownerLabel
          ? `${ownerLabel} has not built anything yet.`
          : "Pages you create appear here, and stay here."}
      </p>
      {!ownerLabel && (
        <Button
          variant="ghost"
          disabled={leaving}
          onClick={() => {
            setLeaving(true);
            window.location.assign("/design");
          }}
        >
          Start a build
        </Button>
      )}
    </Panel>
  );
}

/* ---- the merchant-facing page ------------------------------------------- */

export function LibraryScreen({
  runs,
  account,
}: {
  runs: RunSummary[];
  account: Account | null;
}) {
  const total = runs.reduce((n, r) => n + r.pageCount, 0);

  return (
    <MotionConfig reducedMotion="user">
      <AccountProvider account={account}>
        <div
          translate="no"
          className="notranslate pfd-root relative min-h-screen overflow-x-clip"
        >
          <div aria-hidden className="pfd-glow absolute inset-x-0 top-0 h-[720px]" />
          <div aria-hidden className="pfd-grid absolute inset-x-0 top-0 h-[720px]" />

          <div className="relative mx-auto w-full max-w-[1600px] px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
            <header className="flex items-center justify-between gap-4 border-b border-pf-border pb-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-pf-sm bg-pf-primary text-white">
                  <Icon name="Layers" size={15} />
                </span>
                <span className="hidden font-display text-[15px] font-semibold tracking-[-0.02em] text-pf-text sm:inline">
                  PageFly <span className="text-pf-muted">Design</span>
                </span>
                <PageQuota />
              </div>
              <WorkspaceNav current="library" />
              <StoreMenu />
            </header>

            <div className="pt-4">
              {runs.length > 0 && (
                <p className="text-[12.5px] text-pf-muted">
                  {total} {total === 1 ? "page" : "pages"} from {runs.length}{" "}
                  {runs.length === 1 ? "build" : "builds"}
                </p>
              )}
              <LibraryContent runs={runs} />
            </div>
          </div>
          <ReviewPrompt />
        </div>
      </AccountProvider>
    </MotionConfig>
  );
}
