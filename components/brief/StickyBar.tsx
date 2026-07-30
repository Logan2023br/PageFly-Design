"use client";

import { motion } from "framer-motion";
import { describeSelection, totalSelected } from "@/lib/pageCatalog";
import { useStore } from "@/lib/store";
import { firstMissing } from "@/lib/validation";
import { Button, Icon } from "../ui";

/* The sticky bar names the ONE thing still missing rather than listing every
   validation error — the user only has to act on the next one. */
export function StickyBar() {
  const draft = useStore((s) => s.draft);
  const start = useStore((s) => s.start);

  const total = totalSelected(draft.pages);
  const missing = firstMissing(draft);
  const ready = missing === null;

  const anchor: Record<string, string> = {
    "Tell us what you sell": "pfd-sell",
    "Pick a visual style": "pfd-style",
    "Pick a store type": "pfd-store-type",
    "Pick at least one page": "pfd-pages",
  };

  return (
    <motion.div
      layout
      className="pointer-events-none sticky bottom-0 z-30 -mx-4 mt-2 px-4 pb-4 sm:-mx-6 sm:px-6"
    >
      <motion.div
        layoutId="pfd-action-bar"
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="pointer-events-auto pfd-glass mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-pf-card border border-pf-border px-4 py-3 shadow-pf-float sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-semibold text-pf-text">
              {total === 0
                ? "No pages selected"
                : `${total} page${total === 1 ? "" : "s"} selected`}
            </span>
            {total > 0 && (
              <span className="hidden text-pf-faint sm:inline">·</span>
            )}
            <span className="hidden min-w-0 truncate text-[13px] text-pf-muted sm:block">
              {total > 0 ? describeSelection(draft.pages) : "Pick what you need below"}
            </span>
          </div>
          {!ready && (
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById(anchor[missing] ?? "pfd-sell")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
              className="mt-0.5 flex items-center gap-1.5 text-[12px] font-medium text-pf-warn hover:underline"
            >
              <Icon name="CircleAlert" size={13} />
              {missing}
            </button>
          )}
        </div>

        <Button
          size="lg"
          disabled={!ready}
          onClick={() => void start()}
          title={ready ? undefined : missing ?? undefined}
          iconRight="Sparkles"
        >
          Create pages
        </Button>
      </motion.div>
    </motion.div>
  );
}
