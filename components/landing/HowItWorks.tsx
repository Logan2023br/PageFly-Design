"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon } from "../ui";

/* ==========================================================================
   Four steps, shown rather than described.

   The pictures are SCREENSHOTS of the running app, from `public/how-it-works/`.
   They replaced four drawn placeholders, and the reason is the one the
   placeholders were written to admit: a drawing of a UI is wrong the first time
   that UI changes and nobody notices for months. A screenshot is at least wrong
   visibly, and the person who changed the screen is the person looking at it.

   These four are no longer the four answers of the brief — they are the round
   trip a beta merchant has to be told: build it, look at it in the Library,
   export it, import the .pagefly into the app. Filling in the brief is step one
   of that, not all of it.
   ========================================================================== */

type Step = {
  n: string;
  title: string;
  /** what to do at this step — the tooltip, and the lightbox caption */
  tip: string;
  /** under `public/`, so `next/image` optimises and serves it as webp */
  src: string;
  /** the file's real size, for the lightbox to show it uncropped */
  width: number;
  height: number;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Create pages",
    src: "/how-it-works/01-create-page.png",
    width: 1600,
    height: 752,
    tip: "Pick your options in Build Quickly or Build Detail, then press Create pages.",
  },
  {
    n: "02",
    title: "View your pages",
    src: "/how-it-works/02-view-pages.png",
    width: 1600,
    height: 783,
    tip: "Every page you have built is in the Library. Hover one to see its whole layout, and how it responds at each screen size.",
  },
  {
    n: "03",
    title: "Export pages",
    src: "/how-it-works/03-export-page.png",
    width: 1600,
    height: 840,
    tip: "Hover the top-left corner of a page to export it. The export is one .pagefly file.",
  },
  {
    n: "04",
    title: "Import and live page",
    src: "/how-it-works/04-import-page.png",
    width: 1600,
    height: 883,
    tip: "Import the .pagefly file into the PageFly App to see the page.",
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
          Four steps, brief to live page
        </h2>
        <p className="mt-3 text-pf-body text-pf-muted">
          Hover a step to see what to do. Click to open it full size.
        </p>
      </div>

      {/* Two across, not four. These hold screenshots of a UI, and a quarter of
          a 1,150px row is 270px — a whole brief screen shrunk past the point
          where anyone can tell what they are looking at. Two rows of two gives
          each one about 560px, which is a readable picture of a screen. */}
      <ol className="grid gap-5 sm:grid-cols-2">
        {STEPS.map((step, i) => (
          <li key={step.n} className="group relative">
            <button
              type="button"
              onClick={() => setZoom(step)}
              className="block w-full overflow-hidden rounded-pf-card border border-pf-border bg-pf-bg-deep text-left transition-colors hover:border-pf-border-hi focus:border-pf-primary-hi focus:outline-none"
            >
              {/* 2:1 — a band rather than a box. These sit two to a row at about
                  560px, so 16:10 made each one 350px tall and the four of them a
                  full screen of scrolling before the counts. Every screenshot is
                  between 1.8:1 and 2.13:1, so `object-top` trims a sliver off
                  the bottom and never the part that identifies the screen. */}
              <span className="relative block aspect-[2/1] overflow-hidden bg-pf-bg">
                <Image
                  src={step.src}
                  alt={step.title}
                  fill
                  /* Two columns above 640px, one below — so the browser never
                     fetches a 1,600px copy to paint a 560px card. */
                  sizes="(max-width: 640px) 100vw, 560px"
                  className="object-cover object-top"
                  /* The first two are above the fold on a laptop; the last two
                     are not, and eagerly loading 2.5MB of screenshots to paint
                     a hero nobody has scrolled past yet is the whole reason
                     `loading` exists. */
                  priority={i < 2}
                />
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

                LEFT-ALIGNED to the card, not centred on it. Centred, the two
                right-hand tooltips hung out over the page edge on a laptop and
                the card's own left edge was the only straight line either of
                them did not share.

                Brand purple rather than the panel colour. Every other floating
                surface on this page is `bg-pf-bg-deep` with a hairline border,
                which is right for something you read and wrong for something
                that appears because you pointed at it — the tooltip has to
                announce itself, and on a near-black page the only way to do that
                is to stop being near-black. White text because `pf-body` on
                purple is a grey on a colour, which is the one contrast pairing
                this palette does not hold.

                Shown on hover AND on keyboard focus: a tooltip only a mouse can
                reach is a tooltip half the visitors never see. */}
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 z-20 mb-2.5 w-[min(24rem,92%)] rounded-pf-md border border-pf-primary-hi/60 bg-pf-primary p-3 text-left text-[12.5px] leading-snug text-white opacity-0 shadow-pf-float transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              {step.tip}
              {/* Two triangles, one a pixel below the other: the back one is
                  the border colour and the front one the panel, which is how a
                  CSS arrow keeps a 1px outline on its two visible sides. Moved
                  off centre with the tooltip — an arrow still pointing at the
                  middle of a card whose tooltip starts at its left edge points
                  at nothing. */}
              <span className="absolute left-7 top-full border-x-[7px] border-t-[7px] border-x-transparent border-t-pf-primary-hi/60" />
              <span className="absolute left-7 top-full ml-px -mt-px border-x-[6px] border-t-[6px] border-x-transparent border-t-pf-primary" />
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
            {/* The image's OWN shape here, not the card's 2:1. Someone who
                clicked to see it full size has asked for the part the card
                cropped, and a lightbox that crops it too has answered nothing. */}
            <Image
              src={zoom.src}
              alt={zoom.title}
              width={zoom.width}
              height={zoom.height}
              sizes="(max-width: 1200px) 100vw, 1152px"
              className="h-auto w-full"
            />
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
