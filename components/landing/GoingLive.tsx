"use client";

import { InstallPageFlyButton } from "../pagefly/InstallPageFly";
import { useSeen } from "./useSeen";

/* ==========================================================================
   THE STEP EVERYONE ASKS ABOUT AND NOBODY WAS TOLD.

   A merchant reading this page has one unanswered worry by the time they
   reach the bottom: these are pictures, and my store is not. Left unanswered
   it is the reason to close the tab — the work looks like a demo.

   THIS IS ALSO THE ONE PLACE INSTALLING BELONGS. Everywhere higher up, "no
   install needed" is the argument; here it is the next action, and putting the
   button anywhere else makes the earlier promise read as a catch.
   ========================================================================== */
const STEPS = [
  "Export the pages you keep as .pagefly files",
  "Import them in PageFly — Pages → Import",
  "Re-upload your own product photos, then publish",
];

export function GoingLive() {
  const ref = useSeen<HTMLElement>("live");

  return (
    <section ref={ref} className="relative mx-auto max-w-4xl px-5 py-20 text-center sm:py-24">
      <p className="text-[12.5px] font-semibold uppercase tracking-[0.18em] text-pf-faint">
        Going live
      </p>
      <h2 className="mx-auto mt-3 max-w-2xl font-display text-pf-h2 font-semibold text-pf-text">
        From mockup to live page without rebuilding anything
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-pf-body text-pf-muted">
        The pages you keep do not stay pictures. Export them, import them into the
        PageFly app on your store, and they open in the editor as ordinary PageFly
        pages.
      </p>

      <ol className="mx-auto mt-10 grid max-w-3xl gap-px overflow-hidden rounded-pf-lg border border-pf-border bg-pf-border text-left sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step} className="bg-pf-bg p-5">
            <span className="font-display text-[13px] font-semibold tabular-nums text-pf-faint">
              {i + 1}
            </span>
            <p className="mt-2 text-[13.5px] leading-relaxed text-pf-text">{step}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex flex-col items-center gap-2.5">
        <InstallPageFlyButton surface="landing_live" />
        <span className="text-[12.5px] text-pf-faint">
          Only needed for this step. Already on PageFly? You are set.
        </span>
      </div>
    </section>
  );
}
