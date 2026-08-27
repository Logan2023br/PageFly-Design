"use client";

import { useEffect, useState } from "react";
import { Icon } from "../ui";

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
  src: string;
  alt: string;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Say what you sell",
    tip: "Type it, or press a trade — the chips set which sections a page gets before you choose anything else.",
    src: "/how/01-sell.png",
    alt: "The brief's first card: a text field and a grid of trade chips.",
  },
  {
    n: "02",
    title: "Pick a look",
    tip: "Fifteen styles. Each one sets the palette, the type and the corner radius of every page in the build.",
    src: "/how/02-style.png",
    alt: "Fifteen visual style cards, one selected.",
  },
  {
    n: "03",
    title: "Choose your pages",
    tip: "Tick what you need. The stepper next to a page builds more than one of it — three products, three different pages.",
    src: "/how/03-pages.png",
    alt: "The page picker with core, trust and conversion groups.",
  },
  {
    n: "04",
    title: "Get mockups back",
    tip: "Every page comes back scrollable. Open one to see it at four screen sizes, then export it into the editor.",
    src: "/how/04-results.png",
    alt: "The results grid, each card showing a full page.",
  },
];

/**
 * One screenshot, or an honest stand-in for it.
 *
 * A plain `<img>` rather than `next/image` because this has to survive the file
 * not being there. The shots are captured from the running app and dropped into
 * `public/how/`; until they are, a step still shows its number and title rather
 * than a broken-image glyph or a 500. A section that half-works while its
 * pictures are being taken beats one that cannot ship until they are.
 */
function Shot({ step, className }: { step: Step; className: string }) {
  const [missing, setMissing] = useState(false);

  if (missing)
    return (
      <span
        className={`${className} flex items-center justify-center bg-pf-bg-deep`}
        aria-label={step.alt}
      >
        <span className="px-4 text-center text-[12.5px] text-pf-faint">
          {step.n} · {step.title}
        </span>
      </span>
    );

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={step.src} alt={step.alt} className={className} onError={() => setMissing(true)} />
  );
}

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

      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <li key={step.n} className="group relative">
            <button
              type="button"
              onClick={() => setZoom(step)}
              className="block w-full overflow-hidden rounded-pf-card border border-pf-border bg-pf-bg-deep text-left transition-colors hover:border-pf-border-hi focus:border-pf-primary-hi focus:outline-none"
            >
              <span className="relative block aspect-[4/3] overflow-hidden bg-pf-bg">
                <Shot step={step} className="absolute inset-0 h-full w-full object-cover object-top" />
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

            {/* Shown on hover AND on keyboard focus. A tooltip only a mouse can
                reach is a tooltip half the visitors never see. */}
            <span
              role="tooltip"
              className="pointer-events-none absolute inset-x-2 bottom-[4.25rem] z-10 rounded-pf-md border border-pf-border bg-pf-bg-deep p-3 text-[12.5px] leading-snug text-pf-body opacity-0 shadow-pf-float transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {step.tip}
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
            <Shot step={zoom} className="h-auto w-full" />
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
