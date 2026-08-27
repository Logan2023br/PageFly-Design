"use client";

import { motion } from "framer-motion";
import { useStore } from "@/lib/store";
import type { BuildMode } from "@/lib/validation";
import { Icon } from "../ui";
import type { IconName } from "@/lib/icons";

/* ==========================================================================
   Build Quickly | Build Detail.

   The same segmented control as `WorkspaceNav` in the top bar, deliberately:
   the merchant has already learned what that shape means one row above, and a
   second kind of switch would be a second thing to learn. Buttons rather than
   links, because this changes what is on the page, not which page it is.
   ========================================================================== */

const MODES: { id: BuildMode; label: string; icon: IconName; help: string }[] = [
  {
    id: "quick",
    label: "Build Quickly",
    icon: "Rocket",
    /* What is given up, not what is gained. A merchant choosing between two
       buttons needs to know which one stops asking. */
    help: "Three questions — we choose the style and the store type",
  },
  {
    id: "detail",
    label: "Build Detail",
    icon: "ListChecks",
    help: "Every question: style, store type, your own words, references",
  },
];

export function ModeToggle() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const current = MODES.find((m) => m.id === mode) ?? MODES[0];

  return (
    <div className="grid justify-items-center gap-2">
      <div
        role="radiogroup"
        aria-label="How much to fill in"
        className="flex items-center gap-0.5 rounded-pf-pill border border-pf-border bg-pf-bg-deep/60 p-0.5"
      >
        {MODES.map((m) => {
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(m.id)}
              className={`relative flex items-center gap-1.5 rounded-pf-pill px-3.5 py-2 text-[12.5px] font-semibold transition-colors sm:px-4 ${
                active ? "text-pf-text" : "text-pf-muted hover:text-pf-text"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="pfd-mode-pill"
                  className="absolute inset-0 rounded-pf-pill border border-pf-primary-hi/45 bg-pf-primary/16"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <Icon name={m.icon} size={13} />
                {m.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* One line, under the control rather than inside it: the help belongs to
          whichever mode is on, and both helps side by side would be a wall the
          width of the page. */}
      <p
        aria-live="polite"
        className="text-center text-[12.5px] text-pf-muted"
      >
        {current.help}
      </p>
    </div>
  );
}
