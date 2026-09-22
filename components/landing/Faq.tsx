"use client";

import { SectionHead } from "./SectionHead";
import { useSeen } from "./useSeen";

/* ==========================================================================
   THE QUESTIONS THAT STOP AN ORDER, ANSWERED BEFORE THE BUTTON.

   Six, and each one is a real reason somebody does not press: an install they
   did not expect, a price they cannot see, a page type they need, a wait they
   cannot judge, work they think they cannot undo, a theme they think will
   break.

   ANSWERS OPEN, NOT AN ACCORDION, and that is the change. `<details>` was the
   tidier component and the worse page: six closed rows are six questions a
   visitor now has to decide are worth a click, at the exact moment they are
   deciding whether this is worth anything at all. Two columns of six short
   answers is the same height as six closed rows plus the one they opened, and
   the objection is answered by reading rather than by clicking.

   IT COSTS ONE MEASUREMENT. `design_faq_opened` had nothing left to fire it and
   was deleted from the vocabulary — see the note where it stood in
   `lib/analytics.ts`. What remains is the section reaching the viewport at all,
   and that is the right trade: an open was only ever a proxy for a worry, and
   an answer nobody has to ask for is the thing the proxy was standing in for.
   ========================================================================== */
const QUESTIONS: { id: string; q: string; a: string }[] = [
  {
    id: "install",
    q: "Do I need to install anything to start?",
    a:
      "No. Sign in with your store domain and describe your store. The PageFly app is only needed " +
      "at the very end, to bring the pages into your theme.",
  },
  {
    id: "cost",
    q: "What does it cost?",
    a:
      "Your first three pages are free and no card is needed. After that you keep designing on " +
      "your PageFly plan.",
  },
  {
    id: "which_pages",
    q: "Which pages can it build?",
    a:
      "Home, product, collection, landing or sale pages, about, contact and blog articles — as one " +
      "matching set, or one page at a time.",
  },
  {
    id: "how_long",
    q: "How long does a build take?",
    a:
      "About seven minutes for a page, longer for a full set. Keep the tab open or close it — the " +
      "build carries on either way, and the pages are waiting in your library.",
  },
  {
    id: "editable",
    q: "Can I change the pages afterwards?",
    a:
      "Yes. Once imported, every page is a normal PageFly page: edit any text, swap any image, add " +
      "or remove sections, run A/B tests.",
  },
  {
    id: "theme",
    q: "Does it work with my store?",
    a:
      "Yes — it works with any theme. The pages live in the PageFly app alongside your theme, not " +
      "inside it, so nothing in your theme is touched.",
  },
];

export function Faq() {
  const ref = useSeen<HTMLElement>("faq");

  return (
    <section
      ref={ref}
      id="faq"
      className="scroll-mt-20 border-t border-pf-border px-5 py-20 sm:px-8 sm:py-24 lg:px-[120px]"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center">
        <SectionHead eyebrow="Questions" title="Before you press the button" />

        {/* A RULE PER ITEM, not a box per item. Six bordered cards make six
            objections look like six features; a hairline above each question is
            enough to separate them and keeps the band quiet, which is what a
            band answering worries should be. */}
        <dl className="mt-10 grid w-full gap-x-12 sm:grid-cols-2">
          {QUESTIONS.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 border-t border-pf-border py-[22px]"
            >
              <dt className="font-display text-[18px] font-semibold tracking-[-0.011em] text-pf-text">
                {item.q}
              </dt>
              <dd className="text-[15px] leading-[1.55] text-pf-muted">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
