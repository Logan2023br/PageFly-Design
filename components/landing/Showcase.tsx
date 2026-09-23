"use client";

import Link from "next/link";
import { useState } from "react";
import { EV, track } from "@/lib/analytics";
import { combinePagefly } from "@/lib/collections/pagefly";
import {
  SHOWCASE_SETS,
  pageflyFor,
  type ShowcasePage,
  type ShowcaseSet,
} from "@/lib/showcasePages";
import { Icon } from "../ui";
import { PageThumb, PageViewer } from "./PagePreview";
import { SectionHead } from "./SectionHead";
import { useSeen } from "./useSeen";

/* ==========================================================================
   TWO STORES, SEVEN PAGES EACH, AND THE SECOND SET IS THE ARGUMENT.

   One set proves the pages of a store match each other — which is worth
   proving, and is what the strip under the hero does at a glance. It does not
   answer the question a merchant actually has, which is whether that match is
   THEIRS or a house style this thing puts on everything.

   Two sets answer it, and only by being unalike: Hexwood is near-black and
   loud, Hollis & Rowe is ivory and quiet, and nothing is shared between them
   except the pipeline. Side by side they say the brief decided the look.

   SO THE PILLS ARE A WAY TO THE SECOND SET, NOT A WAY TO HIDE ONE. An earlier
   cut had no pills at all, on the reasoning that nobody compares things they
   have to click between. That reasoning is right about what happens AFTER
   somebody decides to compare, and wrong about the first screen: fourteen cards
   is a long first impression and fourteen iframes to mount, seven of them for a
   comparison the reader has not asked for yet.

   So it opens on the first set — seven pages, which is a set, which is the
   thing to understand first — and the row makes the second store one press
   away. A visitor who wants the comparison finds it in the same glance that
   tells them it exists.

   ONE SET USED TO BE A QUERY. The gallery drew from `/api/showcase` — the demo
   store's most recent run — while the rail above drew from the curated list, so
   the page showed two different stores under one heading claiming they were one
   matching set, and nothing said which half came from where. Both read
   `lib/showcasePages.ts` now; that contradiction is the reason this is a list.
   ========================================================================== */

/* ==========================================================================
   THE WHOLE SET, AS ONE FILE.

   A merchant who wants this store does not want seven downloads and seven
   imports. PageFly's own multi-page export is a zip of numbered entries, and
   `combinePagefly` puts seven single-page files back into exactly that shape —
   read off a real export rather than invented, and already what the collections
   section hands over.

   FETCHED WHEN PRESSED, NOT BEFORE. The seven files are about 200KB for a set
   and most visitors press nothing; loading them to have them ready would be a
   quarter of a megabyte spent on the chance.

   IT CANNOT LEAVE THE BUTTON STUCK. Any failure lands back on `idle`, so a
   second press retries rather than finding a control that says "Preparing…"
   forever — which is what a fetch that rejects silently looks like.
   ========================================================================== */
/* ==========================================================================
   THE HEADING COUNTS THE SETS RATHER THAN STATING A NUMBER.

   It read "Two briefs. Two stores." and the line under it ended "nothing shared
   between the two" — both true when they were written and both wrong the moment
   a third set was added, in the one way nothing catches: the page still renders,
   the sentence is still grammatical, and it is simply lying about what is on
   the screen below it.

   Spelled out rather than "3 briefs", because a numeral in a headline reads as
   data. It goes to ten because the same helper writes the PAGE count in the
   line below, which is seven — the first version stopped at six and rendered
   "7 pages each" in a sentence whose every other number was a word. Past ten it
   falls back to the digit, which is where a word stops helping anyway.
   ========================================================================== */
const WORDS = [
  "no",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
];
const countWord = (n: number) => WORDS[n] ?? String(n);

function download(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  /* Revoked on the next tick rather than immediately — Safari has not started
     reading the blob by the time click() returns. */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ExportSet({ set }: { set: ShowcaseSet }) {
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  const run = async () => {
    if (state === "working") return;
    setState("working");
    track(EV.showcaseSetDownloaded, { set: set.id, pages: set.pages.length });

    try {
      const files = await Promise.all(
        set.pages.map(async (page) => {
          const res = await fetch(pageflyFor(set, page));
          if (!res.ok) throw new Error(`${page.slug}: ${res.status}`);
          return new Uint8Array(await res.arrayBuffer());
        }),
      );
      download(combinePagefly(files), `${set.id}.pagefly`);
      setState("idle");
    } catch {
      /* Said on the button rather than in a console nobody has open. It returns
         to idle on the next press, so the failure is a retry rather than a dead
         control. */
      setState("failed");
    }
  };

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={state === "working"}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-pf-md border border-pf-border-hi px-3 py-1.5 text-[12.5px] font-semibold text-pf-body transition-colors hover:border-pf-primary-hi hover:text-pf-text disabled:opacity-60"
    >
      <Icon name={state === "failed" ? "CircleAlert" : "Download"} size={13} />
      {state === "working"
        ? "Preparing…"
        : state === "failed"
          ? "Try again"
          : `Export free all ${set.pages.length}`}
    </button>
  );
}

export function Showcase() {
  const seen = useSeen<HTMLElement>("showcase");
  /* ======================================================================
     IT OPENS ON THE FIRST SET, NOT ON ALL.

     `null` is "all", and that is where this started — on the argument that a
     filter beginning narrowed hides the very comparison the section exists to
     make. The trade turned out to be worse than the argument: fourteen cards is
     a long first impression, and it is fourteen iframes, of which seven are
     being mounted for a comparison most readers have not asked for yet.

     Seven is a set, which is the first thing to understand; the second store is
     one press away and the pill row says so in the same glance. The argument is
     not hidden, it is offered.
     ====================================================================== */
  const [only, setOnly] = useState<string | null>(SHOWCASE_SETS[0].id);
  /* The set AND the page, because both are needed to find the files and every
     set has a page called Home. A slug alone would open whichever one the code
     happened to look in first. */
  const [open, setOpen] = useState<{ set: ShowcaseSet; page: ShowcasePage } | null>(null);

  const shown = only === null ? SHOWCASE_SETS : SHOWCASE_SETS.filter((s) => s.id === only);

  const pill = (active: boolean) =>
    "rounded-pf-pill border px-4 py-[9px] text-[14px] transition-colors " +
    (active
      ? "border-pf-border-hi bg-pf-card-hi font-semibold text-pf-text"
      : "border-pf-border font-medium text-pf-muted hover:border-pf-border-hi hover:text-pf-text");

  return (
    <section
      ref={seen}
      className="border-t border-pf-border px-5 py-20 sm:px-8 sm:py-24 lg:px-[120px]"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center">
        <SectionHead
          eyebrow="Pages it has already built"
          title={`${countWord(SHOWCASE_SETS.length)} briefs. ${countWord(
            SHOWCASE_SETS.length,
          )} stores. Every page matches.`}
          sub={
            `${countWord(SHOWCASE_SETS[0].pages.length)} pages each, from one short brief each — ` +
            `same voice, same colours, same product facts across a set, and nothing shared ` +
            `between them. Open any of them, read it at three screen sizes, and take the file.`
          }
        />

        {/* ==================================================================
            THE ROW OF PILLS, AND THE ONE THAT LEAVES.

            `All` first in the ROW even though the page opens on a store: it is
            the widest view, and a filter whose broadest option is buried in the
            middle reads as a list of things rather than a range. Then a pill
            per store. Then the dashed one, which is the only one that navigates:
            the row reads as a set of examples ending in "…or yours", which is
            the whole point of showing examples. A solid pill there would read
            as a third filter and quietly leave the page instead.
            ================================================================== */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              track(EV.showcaseFilter, { set: "all" });
              setOnly(null);
            }}
            className={pill(only === null)}
          >
            {/* "All", not "All stores". `All` is not a noun and never takes the
                plural; and the three pills beside it are store names, so the
                word would only repeat what the row already says. The last pill
                is singular — "Your store" — so a plural at the other end would
                also leave the two ends of one row disagreeing. */}
            All
          </button>
          {SHOWCASE_SETS.map((set) => (
            <button
              key={set.id}
              type="button"
              title={set.blurb}
              onClick={() => {
                track(EV.showcaseFilter, { set: set.id });
                setOnly(set.id);
              }}
              className={pill(only === set.id)}
            >
              {set.name}
            </button>
          ))}
          <Link
            href="/design"
            onClick={() => track(EV.ctaClicked, { location: "showcase_pill" })}
            className="inline-flex items-center gap-1.5 rounded-pf-pill border border-dashed border-pf-primary-hi/50 px-4 py-[9px] text-[14px] font-semibold text-pf-primary-hi transition-colors hover:border-pf-primary-hi hover:text-pf-text"
          >
            Your store
            <Icon name="ArrowRight" size={13} />
          </Link>
        </div>

        {shown.map((set, at) => (
          <div key={set.id} className={at === 0 ? "mt-9 w-full" : "mt-14 w-full"}>
            {/* THE SET IS NAMED ABOVE ITS ROW. Both stores have a page called
                Home, so a grid of fourteen cards with no headings is fourteen
                cards a reader has to sort by eye. The rule and the name do that
                for them, and the blurb says what the look is so the contrast is
                stated rather than left to be noticed. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-pf-border pt-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-display text-[18px] font-semibold tracking-[-0.011em] text-pf-text">
                  {set.name}
                </h3>
                <p className="text-[13px] text-pf-faint">{set.blurb}</p>
              </div>
              {/* BESIDE THE SET'S NAME, because that is what it exports. In the
                  toolbar of an opened page it would be a third download button
                  arguing with the one already there, which takes a single
                  page. */}
              <ExportSet set={set} />
            </div>

            {/* FOUR ACROSS ON A DESKTOP, and the card is 3:4 — so a column of a
                1,200px row is 282px wide and 376 tall, which is a page you can
                read the shape of. Two across on a tablet, one on a phone: three
                3:4 cards at 400px would be 120px each, a thumbnail of a
                thumbnail. Seven into four leaves a short last row, which is the
                right way round — stretching three cards across four columns to
                avoid it reads as a layout bug. */}
            <ul className="mt-5 grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {set.pages.map((page) => (
                <li key={page.slug}>
                  <figure className="group relative m-0 overflow-hidden rounded-pf-card border border-pf-border bg-pf-card shadow-pf-card transition-colors hover:border-pf-primary-hi/50">
                    <span className="relative block aspect-[3/4]">
                      {/* Fourteen of these are below the fold at load — see `PageThumb`. */}
                      <PageThumb set={set} page={page} lazy />
                    </span>

                    {/* Over the thumbnail only, so the caption below stays
                        selectable text — and so the page's own buttons inside
                        the iframe are never wrapped in one of ours. */}
                    <button
                      type="button"
                      onClick={() => {
                        track(EV.galleryOpened, {
                          page_type: page.slug,
                          set: set.id,
                          from: "showcase",
                        });
                        setOpen({ set, page });
                      }}
                      aria-label={`Open the ${set.name} ${page.label} page`}
                      className="absolute inset-x-0 top-0 z-10 block aspect-[3/4] w-full cursor-pointer"
                    />

                    <span className="pointer-events-none absolute inset-x-0 top-0 z-20 flex aspect-[3/4] items-end justify-center gap-1.5 bg-gradient-to-t from-pf-bg/85 to-transparent pb-3 text-[11.5px] font-semibold text-pf-text opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      <Icon name="Maximize" size={12} />
                      Open the page
                    </span>

                    <figcaption className="border-t border-pf-border px-3.5 py-3">
                      <span className="block text-[13.5px] font-semibold text-pf-text">
                        {page.label}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-pf-faint">
                        {page.blurb}
                      </span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-[18px] gap-y-3">
          <Link
            href="/design"
            onClick={() => track(EV.ctaClicked, { location: "showcase" })}
            className="inline-flex min-h-12 items-center gap-2.5 rounded-pf-md bg-pf-primary px-6 py-3.5 text-[16px] font-semibold text-white shadow-pf-button transition-colors duration-150 hover:bg-pf-primary-hi"
          >
            Design pages for my store
            <Icon name="ArrowRight" size={15} />
          </Link>
          <span className="text-[13.5px] text-pf-faint">
            First 3 pages free — no card, no password.
          </span>
        </div>
      </div>

      {open && (
        <PageViewer
          set={open.set}
          page={open.page}
          from="showcase"
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
