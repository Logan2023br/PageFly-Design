"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { PageMockup } from "@/lib/generate/types";
import { buildFlyMatePrompt } from "@/lib/promptExport";
import { copyText } from "@/lib/clipboard";
import { useStore } from "@/lib/store";
import { Icon } from "../ui";

/* ==========================================================================
   The two hover actions on a result card.

   Deliberately NOT nested inside the card's click target: a button inside a
   button is invalid HTML, and the browser hoists it out of its parent, which
   breaks hydration. The card keeps a separate absolutely-positioned overlay
   button for "open preview"; this row sits above it on a higher layer.
   ========================================================================== */

type CopyState = "idle" | "copied" | "failed";

export function CardActions({ page }: { page: PageMockup }) {
  const brief = useStore((s) => s.brief);
  const [state, setState] = useState<CopyState>("idle");
  const [tip, setTip] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = async () => {
    const ok = await copyText(buildFlyMatePrompt(page, brief));
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2200);
  };

  const label =
    state === "copied"
      ? "Prompt copied"
      : state === "failed"
        ? "Couldn't copy"
        : "Copy prompt";

  return (
    <div
      className="pointer-events-none absolute inset-x-2 top-2 z-20 flex items-start justify-between gap-2 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100"
    >
      {/* ---- copy prompt ---- */}
      <button
        type="button"
        onClick={onCopy}
        title="Copy a full build spec for this page, ready to paste into FlyMate"
        className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-pf-md px-2.5 py-1.5 text-[11.5px] font-semibold shadow-pf-float backdrop-blur transition-colors duration-150 ${
          state === "copied"
            ? "bg-pf-success text-pf-bg"
            : state === "failed"
              ? "bg-pf-danger text-white"
              : "bg-pf-bg/85 text-pf-body hover:bg-pf-primary hover:text-white"
        }`}
      >
        <Icon
          name={
            state === "copied"
              ? "CircleCheck"
              : state === "failed"
                ? "CircleAlert"
                : "ClipboardList"
          }
          size={13}
        />
        {label}
      </button>

      {/* ---- import to editor: not built yet ----
          aria-disabled rather than the disabled attribute, because a disabled
          button stops firing pointer events in some browsers and the whole
          point of this control right now is its hover message. */}
      <div className="pointer-events-auto relative">
        <button
          type="button"
          aria-disabled="true"
          onClick={(e) => e.preventDefault()}
          onMouseEnter={() => setTip(true)}
          onMouseLeave={() => setTip(false)}
          onFocus={() => setTip(true)}
          onBlur={() => setTip(false)}
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-pf-md bg-pf-bg/70 px-2.5 py-1.5 text-[11.5px] font-semibold text-pf-faint shadow-pf-float backdrop-blur transition-colors duration-150 hover:text-pf-muted"
        >
          <Icon name="Lock" size={12} />
          Import to editor
        </button>

        <AnimatePresence>
          {tip && (
            <motion.div
              role="tooltip"
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.16 }}
              className="absolute bottom-[calc(100%+8px)] right-0 w-[236px] rounded-pf-md border border-pf-border bg-pf-bg-deep px-3 py-2.5 text-left text-[11.5px] leading-snug text-pf-body shadow-pf-float"
            >
              Coming soon. We&apos;ll build direct import into the editor if
              enough merchants tell us this is worth having.
              {/* arrow */}
              <span className="absolute -bottom-1 right-5 size-2 rotate-45 border-b border-r border-pf-border bg-pf-bg-deep" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
