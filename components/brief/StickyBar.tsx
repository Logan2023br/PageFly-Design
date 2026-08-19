"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { describeSelection, totalSelected } from "@/lib/pageCatalog";
import { useStore } from "@/lib/store";
import { firstMissing } from "@/lib/validation";
import { useAccount } from "../AccountProvider";
import { Button, Icon } from "../ui";

/** Wording fixed by the brief. */
const OVER_LIMIT =
  "Bạn đã vượt quá số page build được cho phép, hãy liên hệ với support để hỗ trợ.";

/* The sticky bar names the ONE thing still missing rather than listing every
   validation error — the user only has to act on the next one. */
export function StickyBar() {
  const draft = useStore((s) => s.draft);
  const start = useStore((s) => s.start);
  /* Set by followBuild when a build ends with nothing designed. It was written
     to the store and read by nobody: the merchant waited two minutes, landed
     back on the brief, and was given no reason at all. */
  const buildError = useStore((s) => s.buildError);
  const { account, refresh } = useAccount();
  const [checking, setChecking] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const total = totalSelected(draft.pages);
  const missing = firstMissing(draft);
  const ready = missing === null;

  const remaining = account ? Math.max(0, account.pageLimit - account.pagesUsed) : null;
  /* Selecting more pages than are left is refused up front rather than letting a
     merchant watch a deck generate and then be told it cannot be kept. */
  const wouldExceed = remaining !== null && total > remaining;

  /**
   * The allowance is re-read from the server on the click, not trusted from the
   * last render: a second tab or another admin change could have used it up
   * since this screen loaded.
   */
  const create = async () => {
    if (!ready || checking) return;
    setBlocked(null);
    setChecking(true);
    try {
      const fresh = await refresh();
      const left = fresh ? Math.max(0, fresh.pageLimit - fresh.pagesUsed) : null;
      if (left !== null && (left === 0 || total > left)) {
        setBlocked(OVER_LIMIT);
        return;
      }
      await start();
    } finally {
      setChecking(false);
    }
  };

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
          {/* Above the allowance warnings on purpose. A build that just failed is
              the most recent thing that happened and the only one the merchant
              cannot act on alone. */}
          {buildError && (
            <p
              role="alert"
              className="mb-1 flex items-start gap-1.5 text-[12px] font-semibold text-pf-danger"
            >
              <span className="mt-px shrink-0">
                <Icon name="CircleAlert" size={13} />
              </span>
              <span>
                The page designer could not finish — nothing was built, and
                none of your page allowance was used. Please try again, or
                contact support if it keeps happening.
              </span>
            </p>
          )}
          {blocked && (
            <p
              role="alert"
              className="mt-1 flex items-start gap-1.5 text-[12px] font-semibold text-pf-danger"
            >
              <span className="mt-px shrink-0">
                <Icon name="CircleAlert" size={13} />
              </span>
              {blocked}
            </p>
          )}
          {!blocked && ready && wouldExceed && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[12px] font-medium text-pf-warn">
              <Icon name="TriangleAlert" size={13} />
              {remaining === 0
                ? "No pages left in your allowance"
                : `Only ${remaining} page${remaining === 1 ? "" : "s"} left in your allowance`}
            </p>
          )}
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

        {/* Left enabled when the allowance is short: the click is what explains
            why, and a dead button explains nothing. */}
        <Button
          size="lg"
          disabled={!ready || checking}
          onClick={() => void create()}
          title={ready ? undefined : missing ?? undefined}
          iconRight={checking ? undefined : "Sparkles"}
        >
          {checking ? "Checking…" : "Create pages"}
        </Button>
      </motion.div>
    </motion.div>
  );
}
