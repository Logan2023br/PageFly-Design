"use client";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "framer-motion";
import { useRef, useState } from "react";
import type { PageMockup } from "@/lib/generate/types";
import { MockupThumb } from "../mockup/MockupThumb";
import { Icon, Tag } from "../ui";

/* ==========================================================================
   A result card.

   Hover does the work a click would otherwise be needed for: the tall page
   slowly auto-scrolls inside the card, so a merchant can read a whole page
   without opening anything. Leaving eases back to the top.
   ========================================================================== */

export function ResultCard({
  page,
  index,
  rebuilding,
  onOpen,
}: {
  page: PageMockup;
  index: number;
  rebuilding: boolean;
  onOpen: () => void;
}) {
  const reduced = useReducedMotion();
  const scroll = useMotionValue(0);
  const [scrollState, setScrollState] = useState(0);
  const controls = useRef<ReturnType<typeof animate> | null>(null);

  useMotionValueEvent(scroll, "change", setScrollState);

  const run = (to: number, duration: number) => {
    controls.current?.stop();
    controls.current = animate(scroll, to, {
      duration: reduced ? 0 : duration,
      ease: to === 0 ? [0.22, 1, 0.36, 1] : "linear",
    });
  };

  return (
    /* `w-full` is explicit rather than relying on `display:block` inside the
       grid cell — a button's intrinsic sizing plus a shared-layout transform is
       exactly what made these cards come out uneven. */
    <motion.button
      type="button"
      onClick={onOpen}
      onHoverStart={() => run(1, 7.5)}
      onHoverEnd={() => run(0, 0.55)}
      onFocus={() => run(1, 7.5)}
      onBlur={() => run(0, 0.55)}
      whileHover={reduced ? undefined : { y: -4 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      aria-label={`Open ${page.label} preview`}
      className="group relative block w-full overflow-hidden rounded-pf-card border border-pf-border bg-pf-card text-left shadow-pf-card transition-shadow duration-200 hover:border-pf-primary-hi/50 hover:shadow-pf-glow"
    >
      <div className="relative aspect-[3/4] bg-pf-bg-deep">
        <MockupThumb page={page} scroll={scrollState} className="size-full" />

        {/* Scroll position indicator — only visible while scrubbing. */}
        <motion.div
          className="absolute right-1.5 top-2 bottom-2 w-[2px] rounded-full bg-white/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: scrollState > 0.01 ? 1 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="w-full rounded-full bg-pf-primary-hi"
            style={{ height: "26%", y: `${scrollState * 285}%` }}
          />
        </motion.div>

        {rebuilding && (
          <div className="absolute inset-0 grid place-items-center bg-pf-bg/70 backdrop-blur-sm">
            <motion.span
              animate={reduced ? {} : { rotate: 360 }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
              className="text-pf-primary-hi"
            >
              <Icon name="Loader" size={20} />
            </motion.span>
          </div>
        )}

        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-pf-bg/85 to-transparent pb-3 pt-8 text-[11.5px] font-semibold text-pf-text opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <Icon name="Maximize" size={12} />
          Open preview
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-pf-border px-3.5 py-3">
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold text-pf-text">
            {page.label}
            {page.copyTotal && page.copyTotal > 1 && (
              <span className="font-normal text-pf-faint">
                {" "}
                {page.copyIndex}/{page.copyTotal}
              </span>
            )}
          </span>
          <span className="mt-1 flex items-center gap-2">
            <Tag>{page.categoryLabel}</Tag>
          </span>
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-pf-faint">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
    </motion.button>
  );
}
