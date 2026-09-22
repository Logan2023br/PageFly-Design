"use client";

import { CountUp } from "../ui";
import { useSeen } from "./useSeen";

/* ==========================================================================
   FOUR FIGURES, DIRECTLY UNDER THE HERO.

   They used to close the page, beside the last ask. Read there they are a
   footnote to a decision already made; read here they are the reason to keep
   scrolling, which is the job a proof strip has.

   ONE ROW, BASELINE-ALIGNED, figure and label side by side rather than stacked.
   Stacked in four columns they read as a dashboard — four tiles of equal
   weight, which invites comparing them with each other. On one line separated
   by hairlines they read as one sentence about the product, which is what they
   are.

   THE FIGURES ARE SET BY HAND, NOT READ FROM THE DATABASE, and the record is
   worth keeping straight rather than quietly deleting: at the time of writing
   the database holds 6 stores, 41 pages and one review. `50+` and `350+` are
   therefore not roundings of those numbers. `/api/showcase` still computes the
   real ones and the admin screens still read them — nothing on this page does.
   Anyone wiring the live figures back in should start there.

   (This note, and the counting-up row itself, came from `Counts.tsx`, which
   stood at the foot of the page until the figures moved up here. It had no
   caller left afterwards and was deleted rather than left to rot.)
   ========================================================================== */
const FIGURES: { to: number; decimals: number; suffix: string; label: string }[] = [
  { to: 50, decimals: 0, suffix: "+", label: "stores designed" },
  { to: 350, decimals: 0, suffix: "+", label: "pages built" },
  { to: 7, decimals: 0, suffix: "", label: "page types, one matching set" },
  { to: 4.9, decimals: 1, suffix: "", label: "PageFly app rating" },
];

export function ProofStrip() {
  const ref = useSeen<HTMLDivElement>("proof");

  return (
    <div ref={ref} className="border-y border-pf-border">
      <ul className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-y-6 px-5 py-8 sm:px-8 lg:h-28 lg:flex-nowrap lg:gap-y-0 lg:px-[120px] lg:py-0">
        {FIGURES.map((f, i) => (
          <li key={f.label} className="flex items-center">
            {/* The divider belongs to the figure that FOLLOWS it, so the row
                never ends on one. Hidden while the row wraps — a vertical rule
                between two items that are now above each other is a stray
                mark. */}
            {i > 0 && (
              <span aria-hidden className="mr-0 hidden h-9 w-px bg-pf-border-hi lg:mr-0 lg:block" />
            )}
            <div className="flex items-baseline gap-2.5 px-5 sm:px-8 lg:px-11">
              {/* `tabular-nums` or the figures jitter sideways against each
                  other on every frame of the count. */}
              <span className="font-display text-[30px] font-bold leading-none tracking-[-0.027em] tabular-nums text-pf-text">
                <CountUp to={f.to} decimals={f.decimals} suffix={f.suffix} duration={1100} />
              </span>
              <span className="text-[14px] text-pf-muted">{f.label}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
