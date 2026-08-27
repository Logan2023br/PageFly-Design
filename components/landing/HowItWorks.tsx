"use client";

import { useEffect, useState } from "react";
import { Icon } from "../ui";
import { ArtPages, ArtResults, ArtSell, ArtStyle } from "./StepArt";

/* ==========================================================================
   Four steps, shown rather than described.

   The pictures are SCREENSHOTS of the running app, not illustrations. A drawing
   of a UI is wrong the first time that UI changes and nobody notices for
   months; a screenshot is at least wrong visibly, and the person who changed
   the screen is the person looking at it.

   Four because four is what the product has. Three would have to merge picking
   a look with picking pages, and those are the two answers a merchant spends
   the longest on.
   ========================================================================== */

type Step = {
  n: string;
  title: string;
  /** what to press, and what happens — the tooltip */
  tip: string;
  /** a drawing of the screen; see `StepArt` for why it is not a screenshot */
  art: () => React.ReactElement;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Say what you sell",
    art: ArtSell,
    tip: "Type it, or press a trade — the chips set which sections a page gets before you choose anything else.",
  },
  {
    n: "02",
    title: "Pick a look",
    art: ArtStyle,
    tip: "Fifteen styles. Each one sets the palette, the type and the corner radius of every page in the build.",
  },
  {
    n: "03",
    title: "Choose your pages",
    art: ArtPages,
    tip: "Tick what you need. The stepper next to a page builds more than one of it — three products, three different pages.",
  },
  {
    n: "04",
    title: "Get mockups back",
    art: ArtResults,
    tip: "Every page comes back scrollable. Open one to see it at four screen sizes, then export it into the editor.",
  },
];

export function HowItWorks() {
  const [zoom, setZoom] = useState<Step | null>(null);

  /* Escape closes it. A lightbox that traps someone until they find the small
     button is the thing people remember about a landing page. */
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  return (
    <section className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h2 className="font-display text-pf-h2 font-semibold text-pf-text">
          Four answers, then it builds
        </h2>
        <p className="mt-3 text-pf-body text-pf-muted">
          Hover a step to see what to press. Click to open it full size.
        </p>
      </div>

      {/* Two across, not four. These hold screenshots of a UI, and a quarter of
          a 1,150px row is 270px — a whole brief screen shrunk past the point
          where anyone can tell what they are looking at. Two rows of two gives
          each one about 560px, which is a readable picture of a screen. */}
      <ol className="grid gap-5 sm:grid-cols-2">
        {STEPS.map((step) => (
          <li key={step.n} className="group relative">
            <button
              type="button"
              onClick={() => setZoom(step)}
              className="block w-full overflow-hidden rounded-pf-card border border-pf-border bg-pf-bg-deep text-left transition-colors hover:border-pf-border-hi focus:border-pf-primary-hi focus:outline-none"
            >
              {/* 2:1 — a band rather than a box. These sit two to a row at about
                  560px, so 16:10 made each one 350px tall and the four of them a
                  full screen of scrolling before the counts. A screenshot cropped
                  from the top still shows the part that identifies the screen. */}
              <span className="relative block aspect-[2/1] overflow-hidden bg-pf-bg">
                <step.art />
              </span>
              <span className="flex items-baseline gap-2 px-3.5 py-3">
                <span className="text-[11px] font-semibold tabular-nums text-pf-faint">
                  {step.n}
                </span>
                <span className="text-[13.5px] font-semibold text-pf-text">
                  {step.title}
                </span>
              </span>
            </button>

            {/* ABOVE the card, pointing down at it. Inside the card it covered
                the picture it was describing, which is the one thing a tooltip
                on an image must not do.

                Shown on hover AND on keyboard focus: a tooltip only a mouse can
                reach is a tooltip half the visitors never see. */}
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2.5 w-[min(22rem,90%)] -translate-x-1/2 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3 text-center text-[12.5px] leading-snug text-pf-body opacity-0 shadow-pf-float transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {step.tip}
              {/* Two triangles, one a pixel below the other: the back one is
                  the border colour and the front one the panel, which is how a
                  CSS arrow keeps a 1px outline on its two visible sides. */}
              <span className="absolute left-1/2 top-full -ml-[7px] border-x-[7px] border-t-[7px] border-x-transparent border-t-pf-border" />
              <span className="absolute left-1/2 top-full -ml-[6px] -mt-px border-x-[6px] border-t-[6px] border-x-transparent border-t-pf-bg-deep" />
            </span>
          </li>
        ))}
      </ol>

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={zoom.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,4,14,.88)] p-4 backdrop-blur-sm"
          onClick={() => setZoom(null)}
        >
          <div
            className="relative max-h-full w-full max-w-6xl overflow-auto rounded-pf-card border border-pf-border bg-pf-bg-deep"
            /* The backdrop closes; the picture does not. Without this a click
               anywhere on the thing someone just opened closes it again. */
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setZoom(null)}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-pf-sm border border-pf-border bg-pf-bg-deep p-1.5 text-pf-muted hover:text-pf-text"
            >
              <Icon name="X" size={16} />
            </button>
            <div className="aspect-[2/1] w-full">
              <zoom.art />
            </div>
            <p className="border-t border-pf-border px-4 py-3 text-[13px] text-pf-muted">
              <span className="font-semibold text-pf-text">{zoom.title}</span>{" "}
              — {zoom.tip}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
