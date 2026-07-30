"use client";

import { motion } from "framer-motion";
import { useStore, type Screen } from "@/lib/store";
import { Icon } from "./ui";

const STEPS: { id: Screen; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "generating", label: "Generate" },
  { id: "results", label: "Results" },
];

export function ProgressSteps() {
  const screen = useStore((s) => s.screen);
  const editBrief = useStore((s) => s.editBrief);
  const current = STEPS.findIndex((s) => s.id === screen);

  return (
    <nav
      aria-label="Progress"
      className="flex items-center justify-between gap-4 border-b border-pf-border pb-3.5"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-pf-sm bg-pf-primary text-white">
          <Icon name="Layers" size={15} />
        </span>
        <span className="font-display text-[15px] font-semibold tracking-[-0.02em] text-pf-text">
          PageFly <span className="text-pf-muted">Design</span>
        </span>
      </div>

      <ol className="flex items-center gap-1 sm:gap-2">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          // Going back to the brief is allowed and keeps every answer.
          const clickable = step.id === "brief" && current === 2;

          return (
            <li key={step.id} className="flex items-center gap-1 sm:gap-2">
              {i > 0 && (
                <span
                  aria-hidden
                  className={`h-px w-4 sm:w-7 ${done || active ? "bg-pf-primary-hi/50" : "bg-pf-border"}`}
                />
              )}
              <button
                type="button"
                disabled={!clickable}
                onClick={clickable ? editBrief : undefined}
                aria-current={active ? "step" : undefined}
                className={`relative flex items-center gap-1.5 rounded-pf-pill px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                  active
                    ? "text-pf-text"
                    : done
                      ? "text-pf-muted"
                      : "text-pf-faint"
                } ${clickable ? "hover:text-pf-text" : "cursor-default"}`}
              >
                {active && (
                  <motion.span
                    layoutId="pfd-step-pill"
                    className="absolute inset-0 rounded-pf-pill border border-pf-primary-hi/45 bg-pf-primary/14"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <span
                    className={`grid size-4 place-items-center rounded-full text-[9.5px] tabular-nums ${
                      done
                        ? "bg-pf-primary/30 text-pf-primary-hi"
                        : active
                          ? "bg-pf-primary text-white"
                          : "border border-pf-border"
                    }`}
                  >
                    {done ? <Icon name="Check" size={9} /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{step.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
