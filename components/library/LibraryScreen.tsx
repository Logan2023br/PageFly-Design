"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useState } from "react";
import type { Account } from "@/lib/account";
import { decodeRunPayload } from "@/lib/runPayload";
import { useStore, useVisiblePages } from "@/lib/store";
import type { RunSummary } from "@/app/api/runs/route";
import { AccountProvider } from "../AccountProvider";
import { GeneratingScreen } from "../generating/GeneratingScreen";
import { PreviewOverlay } from "../preview/PreviewOverlay";
import { ExportProvider } from "../results/ExportProvider";
import { ResultsScreen } from "../results/ResultsScreen";
import { PageQuota, WorkspaceNav } from "../ProgressSteps";
import { ReviewPrompt } from "../review/ReviewPrompt";
import { Button, Eyebrow, Icon, Panel } from "../ui";

/* ==========================================================================
   Library — every deck this store has built.

   Reopening a run replays the generator with the saved brief and variant
   numbers, which reproduces the exact pages that were saved (see
   lib/runPayload.ts). Nothing about page generation changes; the deck is then
   handed to the SAME results screen the Design flow uses, so a page looks and
   behaves identically wherever it is opened from — including preview, device
   sizes and .pagefly export.
   ========================================================================== */

/**
 * The list and the deck, with no page chrome.
 *
 * Split out because the admin drill-down renders this INSIDE the admin shell.
 * Reusing the full-page version there nested a second glow, a second header and
 * a second min-h-screen inside the first.
 */
export function LibraryContent({
  runs,
  ownerLabel,
}: {
  runs: RunSummary[];
  ownerLabel?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const loadSavedRun = useStore((s) => s.loadSavedRun);
  const closePreview = useStore((s) => s.closePreview);

  const open = async (run: RunSummary) => {
    const decoded = decodeRunPayload(run.payload);
    if (!decoded.ok) {
      setProblem(decoded.reason);
      return;
    }
    setProblem(null);
    setOpenId(run.id);
    await loadSavedRun(decoded.payload.brief, decoded.payload.variants);
  };

  const backToList = () => {
    closePreview();
    setOpenId(null);
  };

  return openId ? (
    <div>
      <button
        type="button"
        onClick={backToList}
        className="mb-1 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-pf-muted transition-colors hover:text-pf-text"
      >
        <Icon name="ArrowLeft" size={14} />
        Back to library
      </button>
      <ExportProvider>
        <Deck />
      </ExportProvider>
    </div>
  ) : (
    <RunList
      runs={runs}
      problem={problem}
      ownerLabel={ownerLabel}
      onOpen={open}
    />
  );
}

/** The merchant-facing page: full chrome, quota, nav and review prompt. */
export function LibraryScreen({
  runs,
  account,
}: {
  runs: RunSummary[];
  account: Account | null;
}) {
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
              <div className="hidden text-[12px] text-pf-muted md:block">
                {account?.domain ?? ""}
              </div>
            </header>

            <div className="pt-3">
              <LibraryContent runs={runs} />
            </div>
          </div>
          {/* The five minutes can elapse while the merchant is browsing what
              they built, which is the most likely place to be. */}
          <ReviewPrompt />
        </div>
      </AccountProvider>
    </MotionConfig>
  );
}

/** The saved deck, rendered by the same screens the Design flow uses. */
function Deck() {
  const screen = useStore((s) => s.screen);
  const previewIndex = useStore((s) => s.previewIndex);
  const openPreview = useStore((s) => s.openPreview);
  const visible = useVisiblePages();

  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
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

/* ---- the list ------------------------------------------------------------ */

function RunList({
  runs,
  problem,
  ownerLabel,
  onOpen,
}: {
  runs: RunSummary[];
  problem: string | null;
  ownerLabel?: string;
  onOpen: (run: RunSummary) => Promise<void>;
}) {
  return (
    <main className="pt-5">
      <div className="grid gap-1.5">
        <Eyebrow>Library</Eyebrow>
        <h1 className="font-display text-[24px] font-bold tracking-[-0.025em] text-pf-text sm:text-[30px]">
          {ownerLabel ? `Pages built by ${ownerLabel}` : "Pages you have built"}
        </h1>
        <p className="text-[13px] text-pf-muted">
          {runs.length === 0
            ? "Nothing here yet."
            : `${runs.length} ${runs.length === 1 ? "build" : "builds"}, ${runs.reduce((n, r) => n + r.pageCount, 0)} pages in total. Open one to browse it exactly as it was made.`}
        </p>
      </div>

      {problem && (
        <p
          role="alert"
          className="mt-4 flex items-center gap-2 rounded-pf-md border border-pf-danger/35 bg-pf-danger/10 px-3 py-2.5 text-[12.5px] font-semibold text-pf-danger"
        >
          <Icon name="CircleAlert" size={14} />
          {problem}
        </p>
      )}

      {runs.length === 0 ? (
        <Panel className="mt-5 grid place-items-center gap-3 px-6 py-14 text-center">
          <span className="grid size-10 place-items-center rounded-pf-md border border-pf-border text-pf-faint">
            <Icon name="Library" size={18} />
          </span>
          <p className="text-[13.5px] text-pf-muted">
            Builds you create appear here, and stay here.
          </p>
          {!ownerLabel && (
            <Button variant="ghost" onClick={() => window.location.assign("/design")}>
              Start a build
            </Button>
          )}
        </Panel>
      ) : (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {runs.map((run, i) => (
            <motion.li
              key={run.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.28 }}
            >
              <RunCard run={run} onOpen={onOpen} />
            </motion.li>
          ))}
        </ul>
      )}
    </main>
  );
}

function RunCard({
  run,
  onOpen,
}: {
  run: RunSummary;
  onOpen: (run: RunSummary) => Promise<void>;
}) {
  const [opening, setOpening] = useState(false);
  /* Grouped by page type so a 12-page deck reads as "3 landing, 2 product"
     rather than as twelve near-identical chips. */
  const grouped = new Map<string, number>();
  for (const p of run.pages) {
    grouped.set(p.label, (grouped.get(p.label) ?? 0) + 1);
  }

  return (
    <Panel className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-pf-text">
            {run.sell || "Untitled build"}
          </p>
          <p className="mt-0.5 text-[11.5px] text-pf-muted">
            <RunDate iso={run.createdAt} /> · {run.styleLabel}
          </p>
        </div>
        <span className="shrink-0 rounded-pf-pill border border-pf-border px-2 py-0.5 text-[11px] font-semibold tabular-nums text-pf-muted">
          {run.pageCount} {run.pageCount === 1 ? "page" : "pages"}
        </span>
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {[...grouped.entries()].slice(0, 6).map(([label, count]) => (
          <li
            key={label}
            className="rounded-pf-sm border border-pf-border bg-pf-bg-deep/50 px-2 py-0.5 text-[11px] text-pf-muted"
          >
            {label}
            {count > 1 && <span className="text-pf-faint"> ×{count}</span>}
          </li>
        ))}
        {grouped.size > 6 && (
          <li className="px-1 py-0.5 text-[11px] text-pf-faint">
            +{grouped.size - 6} more
          </li>
        )}
      </ul>

      <div className="mt-auto pt-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={opening}
          iconRight="ArrowRight"
          className="w-full"
          onClick={() => {
            setOpening(true);
            void onOpen(run).finally(() => setOpening(false));
          }}
        >
          {opening ? "Opening…" : "Open"}
        </Button>
      </div>
    </Panel>
  );
}

/** Rendered client-side on purpose: a date formatted on the server shows in the
    server's locale and timezone, which is not the merchant's. */
function RunDate({ iso }: { iso: string }) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}
    </time>
  );
}
