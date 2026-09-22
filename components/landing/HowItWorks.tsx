"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { EV, track } from "@/lib/analytics";
import { Icon } from "../ui";
import { SectionHead } from "./SectionHead";
import { useSeen } from "./useSeen";

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

   THE EXPLANATION IS PRINTED, NOT HOVERED. It used to be a tooltip, which put
   the sentence that tells you what a step IS behind an action only a mouse can
   take — and then, to avoid covering the screenshot it described, floated it
   above the card where it overlapped the one above. A paragraph under the
   picture is readable on a phone, readable with a keyboard, and covers nothing.

   THE CHIP ON THE RIGHT IS THE COST OF THE STEP: how long, on what screens,
   what it needs. It is the question a merchant has at each step and the one
   thing a screenshot cannot show.
   ========================================================================== */

type Step = {
  n: string;
  title: string;
  /** what this step costs: a duration, a set of screens, a dependency */
  chip: string;
  /** what to do at this step — printed under the picture, and the caption */
  body: string;
  /** under `public/`, so `next/image` optimises and serves it as webp */
  src: string;
  /** the file's real size, for the lightbox to show it uncropped */
  width: number;
  height: number;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Answer four questions",
    chip: "~2 min",
    src: "/how-it-works/01-create-page.png",
    width: 1600,
    height: 752,
    body:
      "What you sell, where you sell it, your colours, the pages you want. The market sets the " +
      "language, currency and payment methods on every page.",
  },
  {
    n: "02",
    title: "Get your pages back",
    chip: "~7 min per page",
    src: "/how-it-works/02-view-pages.png",
    width: 1600,
    height: 783,
    body:
      "Home, product, collection, landing and more — written and laid out for your products, and " +
      "consistent with each other. Every page you have built stays in the Library.",
  },
  {
    n: "03",
    title: "Preview, then export",
    chip: "Desktop · tablet · mobile",
    src: "/how-it-works/03-export-page.png",
    width: 1600,
    height: 840,
    body:
      "Open any page at full size on three screen sizes. Keep the ones you like and export them as " +
      ".pagefly files — one page or the whole set.",
  },
  {
    n: "04",
    title: "Import and go live",
    chip: "Needs the PageFly app",
    src: "/how-it-works/04-import-page.png",
    width: 1600,
    height: 883,
    body:
      "Import the files into PageFly on your store. Every page opens in the editor as a normal " +
      "PageFly page — change anything, then publish.",
  },
];

export function HowItWorks() {
  const seen = useSeen<HTMLElement>("how");
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
    <section
      ref={seen}
      id="how"
      className="scroll-mt-20 border-t border-pf-border px-5 py-20 sm:px-8 sm:py-24 lg:px-[120px]"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center">
        <SectionHead
          eyebrow="How it works"
          title="Four answers in. A full set of pages out."
          /* WHICH STEP NEEDS THE APP, SAID HERE. It is the question the whole
             "nothing to install" promise raises, and leaving it to the fourth
             tile makes the promise read as a catch. */
          sub="Steps one to three need nothing installed. Only the last step — putting pages live — uses the free PageFly app."
        />

        {/* Two across, not four. These hold screenshots of a UI, and a quarter
            of a 1,200px row is 282px — a whole brief screen shrunk past the
            point where anyone can tell what they are looking at. Two rows of
            two gives each one about 560px, which is a readable picture of a
            screen. */}
        <ol className="mt-11 grid w-full gap-8 lg:grid-cols-2">
          {STEPS.map((step, i) => (
            <li
              key={step.n}
              className="flex flex-col gap-4 rounded-pf-lg border border-pf-border bg-pf-card p-3 pb-[22px] transition-colors hover:border-pf-border-hi"
            >
              <button
                type="button"
                onClick={() => {
                  track(EV.howStepOpened, { step: step.n });
                  setZoom(step);
                }}
                aria-label={`Open ${step.title} full size`}
                className="block cursor-zoom-in overflow-hidden rounded-[10px] bg-pf-bg-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-pf-primary-hi"
              >
                {/* 2:1 — a band rather than a box. Every screenshot is between
                    1.8:1 and 2.13:1, so `object-top` trims a sliver off the
                    bottom and never the part that identifies the screen. */}
                <span className="relative block aspect-[2/1]">
                  <Image
                    src={step.src}
                    alt={step.title}
                    fill
                    /* Two columns above 1024px, one below — so the browser never
                       fetches a 1,600px copy to paint a 560px card. */
                    sizes="(max-width: 1024px) 100vw, 560px"
                    className="object-cover object-top"
                    /* The first two are above the fold on a laptop; the last two
                       are not, and eagerly loading 2.5MB of screenshots to paint
                       a hero nobody has scrolled past yet is the whole reason
                       `loading` exists. */
                    priority={i < 2}
                  />
                </span>
              </button>

              <div className="flex flex-col gap-1.5 px-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[13px] font-semibold tabular-nums text-pf-faint">
                      {step.n}
                    </span>
                    <h3 className="font-display text-[22px] font-semibold tracking-[-0.018em] text-pf-text">
                      {step.title}
                    </h3>
                  </div>
                  <span className="shrink-0 rounded-pf-sm border border-pf-border-hi px-[9px] py-1 text-[12px] font-semibold text-pf-body/[.72]">
                    {step.chip}
                  </span>
                </div>
                <p className="text-[15px] leading-[1.55] text-pf-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

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
              <span className="font-semibold text-pf-text">{zoom.title}</span> — {zoom.body}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
