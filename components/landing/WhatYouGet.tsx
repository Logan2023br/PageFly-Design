"use client";

import { useSeen } from "./useSeen";

/* ==========================================================================
   WHAT ARRIVES, IN SIX PLAIN STATEMENTS.

   The page had no answer to "what do I actually get". The hero promised pages
   and the showcase proved they exist, and between them a visitor had to infer
   the rest — how many types, in what language, editable where, at what cost.
   Every one of those is a reason someone closes the tab rather than asks.

   SIX, NOT THREE. Each is a separate objection, and merging two into one
   paragraph answers neither.
   ========================================================================== */
const ITEMS: { title: string; body: string }[] = [
  {
    title: "Seven page types, one set",
    body:
      "Home, product, collection, landing or sale page, about, contact and blog article. " +
      "Built together, so they share one voice and one palette rather than looking like seven jobs.",
  },
  {
    title: "Written for your market",
    body:
      "Pick where you sell and the pages come back in that language, with that currency and the " +
      "payment and delivery lines that market expects.",
  },
  {
    title: "See it before you build it",
    body:
      "Every page opens full size on desktop, tablet and mobile. Read it all the way down, keep " +
      "the ones you want and leave the rest.",
  },
  {
    title: "Real copy about your products",
    body:
      "Headlines, ingredient tables, size guides, FAQs — drawn from what you said you sell, not " +
      "lorem ipsum with your logo on it.",
  },
  {
    title: "Straight into your PageFly editor",
    body:
      "Export a .pagefly file and import it into the PageFly app on your store. Every page arrives " +
      "as a normal PageFly page you can edit.",
  },
  {
    title: "Zero setup to start",
    body:
      "Your store domain is your sign-in. No app to install, no password to invent, no card. Your " +
      "first three pages are free.",
  },
];

export function WhatYouGet() {
  const ref = useSeen<HTMLElement>("get");

  return (
    <section ref={ref} id="get" className="relative mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:py-24">
      <p className="text-center text-[12.5px] font-semibold uppercase tracking-[0.18em] text-pf-faint">
        What you get
      </p>
      <h2 className="mx-auto mt-3 max-w-2xl text-center font-display text-pf-h2 font-semibold text-pf-text">
        Not a template. Your store, designed.
      </h2>

      <ul className="mt-12 grid gap-px overflow-hidden rounded-pf-lg border border-pf-border bg-pf-border sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map((item) => (
          <li key={item.title} className="bg-pf-bg p-6">
            <h3 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-pf-text">
              {item.title}
            </h3>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-pf-muted">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
