"use client";

import { EV, track } from "@/lib/analytics";
import { useSeen } from "./useSeen";

/* ==========================================================================
   THE QUESTIONS THAT STOP AN ORDER, ANSWERED BEFORE THE BUTTON.

   Six, and each one is a real reason somebody does not press: an install they
   did not expect, a price they cannot see, a page type they need, a wait they
   cannot judge, work they think they cannot undo, a theme they think will
   break.

   `<details>` RATHER THAN STATE. It opens without JavaScript, it is keyboard
   and screen-reader correct without a single aria attribute, and the browser
   owns the one piece of state involved. The only thing measured is the open,
   because a question nobody opens is one nobody was worried about.
   ========================================================================== */
const QUESTIONS: { id: string; q: string; a: string }[] = [
  {
    id: "install",
    q: "Do I need to install anything to start?",
    a:
      "No. Sign in with your store domain and describe your store. The PageFly app is only needed " +
      "at the last step, when you put a page live.",
  },
  {
    id: "cost",
    q: "What does it cost?",
    a:
      "Your first three pages are free and no card is needed. After that you keep designing on your " +
      "PageFly plan.",
  },
  {
    id: "which_pages",
    q: "Which pages can it build?",
    a:
      "Home, product, collection, landing or sale pages, about, contact and blog articles — designed " +
      "together as one matching set rather than one at a time.",
  },
  {
    id: "how_long",
    q: "How long does a build take?",
    a:
      "About seven minutes for a page. Keep the tab open or close it — the build carries on either " +
      "way, and the pages are waiting in your library.",
  },
  {
    id: "editable",
    q: "Can I change the pages afterwards?",
    a:
      "Yes. Once imported, every page is a normal PageFly page: edit any text, swap any image, add " +
      "or remove sections.",
  },
  {
    id: "theme",
    q: "Does it work with my store?",
    a:
      "Yes, with any theme. The pages live in the PageFly app alongside your theme rather than " +
      "inside it, so nothing about your current theme has to change.",
  },
];

export function Faq() {
  const ref = useSeen<HTMLElement>("faq");

  return (
    <section ref={ref} id="faq" className="relative mx-auto max-w-3xl scroll-mt-20 px-5 py-20 sm:py-24">
      <p className="text-center text-[12.5px] font-semibold uppercase tracking-[0.18em] text-pf-faint">
        Questions
      </p>
      <h2 className="mt-3 text-center font-display text-pf-h2 font-semibold text-pf-text">
        Before you press the button
      </h2>

      <div className="mt-12 border-t border-pf-border">
        {QUESTIONS.map((item) => (
          <details
            key={item.id}
            className="group border-b border-pf-border"
            /* Fires on open only. `onToggle` runs for the close as well, and a
               count that includes closes says how many times a question was
               touched rather than how many people needed it. */
            onToggle={(e) => {
              if (e.currentTarget.open) track(EV.faqOpened, { question: item.id });
            }}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[15px] font-semibold text-pf-text marker:hidden [&::-webkit-details-marker]:hidden">
              {item.q}
              {/* Two bars, the upright one turned away when the row opens —
                  a plus that becomes a minus, drawn rather than typed so it
                  inherits the row's colour. */}
              <span className="relative size-3 shrink-0">
                <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-pf-muted" />
                <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 rotate-90 bg-pf-muted transition-transform duration-200 group-open:rotate-0" />
              </span>
            </summary>
            <p className="pb-6 pr-8 text-[13.5px] leading-relaxed text-pf-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
