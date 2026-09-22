"use client";

import Image from "next/image";
import { InstallPageFlyButton } from "../pagefly/InstallPageFly";
import { useSeen } from "./useSeen";

/* ==========================================================================
   THE STEP EVERYONE ASKS ABOUT AND NOBODY WAS TOLD.

   A merchant reading this page has one unanswered worry by the time they
   reach the bottom: these are pictures, and my store is not. Left unanswered
   it is the reason to close the tab — the work looks like a demo.

   SIDE BY SIDE, not centred, and that is the argument rather than the layout.
   Three centred steps under a heading read as a list of instructions; three
   steps beside a screenshot of the editor they end in read as a thing that
   already happens, which is the claim being made.

   THIS IS ALSO THE ONE PLACE INSTALLING BELONGS. Everywhere higher up, "no
   install needed" is the argument; here it is the next action, and putting the
   button anywhere else makes the earlier promise read as a catch. It is a
   ghost, not a filled button — it is the only control in this band, and it is
   not the ask this page exists for.
   ========================================================================== */
const STEPS = [
  "Export the pages you keep as .pagefly files",
  "Import them in PageFly — Pages → Import",
  "Re-upload your own product photos, then publish",
];

export function GoingLive() {
  const ref = useSeen<HTMLElement>("live");

  return (
    <section
      ref={ref}
      className="border-t border-pf-border px-5 py-20 sm:px-8 sm:py-24 lg:px-[120px]"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-10 lg:flex-row lg:items-center lg:gap-14">
        <div className="flex w-full flex-col gap-4 lg:w-[560px] lg:shrink-0">
          <p className="text-[12px] font-semibold uppercase tracking-[0.075em] text-pf-violet">
            Going live
          </p>
          {/* 40px here against the 44px every other band uses. This heading is
              beside its picture rather than over the page, and at 44 it ran to
              three lines in a 560px column while the picture next to it stayed
              one block — the two halves stopped looking like one row. */}
          <h2 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-pf-text">
            From mockup to live page without rebuilding anything
          </h2>
          <p className="text-[16px] leading-relaxed text-pf-muted">
            The pages you keep don&rsquo;t stay pictures. Export them, import them into
            the PageFly app on your store, and they open in the editor exactly as
            you saw them — ready to tweak and publish.
          </p>

          <ol className="mt-1.5 flex flex-col gap-2.5 text-[15px] text-pf-body/85">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                {/* A ring, not a filled chip. Three filled purple discs down the
                    left of a paragraph out-shout the sentences they number. */}
                <span className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full border border-pf-border-hi text-[12px] font-semibold tabular-nums text-pf-primary-hi">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-[18px] gap-y-3">
            <InstallPageFlyButton
              variant="ghost"
              size="lg"
              surface="landing_live"
              label="Install PageFly — free plan"
            />
            <span className="text-[13px] text-pf-faint">
              Only needed for this step. Already on PageFly? You&rsquo;re set.
            </span>
          </div>
        </div>

        {/* THE EXPORT SCREEN, because that is the step being described and a
            merchant recognising the panel they are about to use is worth more
            than any drawing of it. Matted in 12px of the card colour so the
            screenshot's own white chrome does not touch the page. */}
        <div className="w-full rounded-pf-lg border border-pf-border bg-pf-card p-3">
          <Image
            src="/how-it-works/03-export-page.png"
            alt="Exporting a page from PageFly Design to import into the editor"
            width={1600}
            height={840}
            sizes="(max-width: 1024px) 100vw, 560px"
            className="h-auto w-full rounded-[10px]"
          />
        </div>
      </div>
    </section>
  );
}
