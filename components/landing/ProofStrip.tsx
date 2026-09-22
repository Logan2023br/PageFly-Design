"use client";

import { CountUp, GradientWord } from "../ui";
import { useSeen } from "./useSeen";

/* ==========================================================================
   FOUR FIGURES, DIRECTLY UNDER THE HERO.

   They used to close the page, beside the last ask. Read there they are a
   footnote to a decision already made; read here they are the reason to keep
   scrolling, which is the job a proof strip has.

   THE FIGURES ARE SET BY HAND. `Counts.tsx` carries the full note on why and
   what the database actually holds; nothing here reads it either, and anyone
   changing one should change both.
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
    <div ref={ref} className="mx-auto max-w-5xl px-5 pb-6 pt-10 sm:pt-14">
      <dl className="flex flex-wrap items-start justify-center gap-y-8 border-y border-pf-border py-8">
        {FIGURES.map((f) => (
          <div key={f.label} className="flex-1 basis-40 px-5 text-center">
            <dd>
              {/* `tabular-nums` or the figures jitter sideways against each
                  other on every frame of the count. */}
              <span className="block font-display text-[clamp(1.9rem,4vw,2.6rem)] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                <GradientWord>
                  <CountUp to={f.to} decimals={f.decimals} suffix={f.suffix} duration={1100} />
                </GradientWord>
              </span>
              <span className="mt-2.5 block text-[12.5px] leading-snug text-pf-muted">
                {f.label}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
