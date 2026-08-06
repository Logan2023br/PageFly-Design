"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { CATEGORY_BY_ID, PAGE_BY_ID, type CategoryId } from "@/lib/pageCatalog";
import { useStore, useVisiblePages } from "@/lib/store";
import { Button, Chip, Icon, InlineError, Panel } from "../ui";
import { useExport } from "./ExportProvider";
import { LOCKED_TOOLTIP } from "./CardActions";
import { ResultCard } from "./ResultCard";

/* ---- partial-failure notice -------------------------------------------- */

function FailureNotice() {
  const failures = useStore((s) => s.failures);
  const plan = useStore((s) => s.plan);
  const retryFailed = useStore((s) => s.retryFailed);

  if (failures.length === 0) return null;

  return (
    <Panel className="flex flex-wrap items-center justify-between gap-3 border-pf-danger/35 bg-pf-danger/8 px-4 py-3.5">
      <span className="flex items-start gap-2.5 text-[13.5px] text-pf-body">
        <span className="mt-px text-pf-danger">
          <Icon name="CircleAlert" size={16} />
        </span>
        <span>
          Couldn&apos;t build {failures.length} of {plan.length} page
          {plan.length === 1 ? "" : "s"}:{" "}
          <span className="text-pf-muted">
            {failures
              .map((f) => PAGE_BY_ID[f.label]?.label ?? f.label)
              .join(", ")}
            .
          </span>{" "}
          Try again for just those.
        </span>
      </span>
      <Button
        size="sm"
        variant="ghost"
        icon="RotateCcw"
        onClick={() => void retryFailed()}
      >
        Retry {failures.length === 1 ? "that page" : `those ${failures.length}`}
      </Button>
    </Panel>
  );
}

/* ---- toolbar ------------------------------------------------------------ */

function Toolbar() {
  const pages = useStore((s) => s.pages);
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const editBrief = useStore((s) => s.editBrief);
  const regenerateAll = useStore((s) => s.regenerateAll);
  const visible = useVisiblePages();
  const { exportAll, exportPageflyAll, exporting, progress } = useExport();
  const [lockedTip, setLockedTip] = useState(false);

  // Only offer filters for categories that actually produced pages.
  const categories = useMemo(() => {
    const counts = new Map<CategoryId, number>();
    for (const p of pages) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [pages]);

  return (
    <div className="grid gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-[-0.03em] text-pf-text sm:text-[30px]">
            {pages.length} page{pages.length === 1 ? "" : "s"}
          </h1>
          <p className="mt-1 text-[12.5px] text-pf-muted">
            Hover to scroll. Click to open.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" icon="Pencil" onClick={editBrief}>
            Edit brief
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="RotateCcw"
            onClick={() => void regenerateAll()}
            title="Rebuild every page from the same brief"
          >
            Regenerate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="Download"
            disabled={exporting || visible.length === 0}
            onClick={() => void exportAll(visible)}
            title={`Download ${visible.length} PNG${visible.length === 1 ? "" : "s"}`}
          >
            {exporting ? `Exporting ${progress ?? ""}` : "PNG"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            icon="Download"
            disabled={exporting || visible.length === 0}
            onClick={() => void exportPageflyAll(visible)}
            title={`Download ${visible.length} .pagefly file${visible.length === 1 ? "" : "s"} to import into PageFly`}
          >
            {exporting ? `Exporting ${progress ?? ""}` : "Export all"}
          </Button>

          {/* Not built yet. aria-disabled rather than disabled so the control
              still fires pointer events — its hover message is the point. */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              icon="Lock"
              aria-disabled="true"
              onClick={(e) => e.preventDefault()}
              onMouseEnter={() => setLockedTip(true)}
              onMouseLeave={() => setLockedTip(false)}
              onFocus={() => setLockedTip(true)}
              onBlur={() => setLockedTip(false)}
              className="cursor-not-allowed text-pf-faint hover:text-pf-muted"
            >
              Import to editor all
            </Button>

            <AnimatePresence>
              {lockedTip && (
                <motion.div
                  role="tooltip"
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.16 }}
                  className="absolute right-0 top-[calc(100%+8px)] z-40 w-[236px] rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2.5 text-left text-[11.5px] leading-snug text-pf-body shadow-pf-float"
                >
                  {LOCKED_TOOLTIP}
                  <span className="absolute -top-1 right-5 size-2 rotate-45 border-l border-t border-pf-border bg-pf-bg-deep" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {categories.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-pf-faint">
            <Icon name="Filter" size={13} />
            Filter
          </span>
          <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
            All {pages.length}
          </Chip>
          {categories.map(([cat, count]) => (
            <Chip
              key={cat}
              selected={filter === cat}
              onClick={() => setFilter(cat)}
            >
              {CATEGORY_BY_ID[cat].label} {count}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---- screen ------------------------------------------------------------- */

export function ResultsScreen({ onOpen }: { onOpen: (index: number) => void }) {
  const visible = useVisiblePages();
  const rebuilding = useStore((s) => s.rebuilding);
  const { error, clearError } = useExport();

  return (
    <motion.div
      key="results"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-7xl pt-4 sm:pt-8"
    >
      <div className="grid gap-5">
        <Toolbar />
        <FailureNotice />

        <AnimatePresence>
          {error && <InlineError onDismiss={clearError}>{error}</InlineError>}
        </AnimatePresence>

        {/* No `layout` prop on this grid or on the items.
            Nesting layout animations (grid → item → card's shared layoutId)
            put three projection trees inside each other: the grid scaled, the
            items counter-scaled, and the transforms stuck — every card ended up
            a different size with its label at the wrong scale. CSS grid sizes
            the cells; only opacity is animated here. */}
        <div className="grid grid-cols-1 items-start gap-3.5 pb-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence initial={false}>
            {visible.map((page, i) => (
              <motion.div
                key={page.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="min-w-0"
              >
                <ResultCard
                  page={page}
                  index={i}
                  rebuilding={rebuilding.includes(page.id)}
                  onOpen={() => onOpen(i)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
