"use client";

import { Icon } from "../ui";
import type { IconName } from "@/lib/icons";
import { SectionHead } from "./SectionHead";
import { useSeen } from "./useSeen";

/* ==========================================================================
   WHAT ARRIVES, IN SIX PLAIN STATEMENTS.

   The page had no answer to "what do I actually get". The hero promised pages
   and the gallery proved they exist, and between them a visitor had to infer
   the rest — how many types, in what language, editable where, at what cost.
   Every one of those is a reason someone closes the tab rather than asks.

   SIX, NOT THREE. Each is a separate objection, and merging two into one
   paragraph answers neither.
   ========================================================================== */
const ITEMS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "LayoutGrid",
    title: "Seven page types, one set",
    body:
      "Home, product, collection, landing or sale page, about, contact and blog article. Built " +
      "together, so the header on the product page is the header on the home page.",
  },
  {
    icon: "MapPin",
    title: "Written for your market",
    body:
      "Pick where you sell and the pages come back in that language, with that currency and the " +
      "payment and delivery lines that market expects.",
  },
  {
    icon: "Monitor",
    title: "See it before you build it",
    body:
      "Every page opens full size on desktop, tablet and mobile. Read it all the way down, keep " +
      "the ones you want and leave the rest.",
  },
  {
    icon: "Pencil",
    title: "Real copy about your products",
    body:
      "Headlines, ingredient tables, size guides, FAQs — drawn from what you said you sell, not " +
      "lorem ipsum with your logo on it.",
  },
  {
    icon: "Download",
    title: "Straight into your PageFly editor",
    body:
      "Export a .pagefly file and import it into the PageFly app on your store. Every page arrives " +
      "as a normal PageFly page you can edit.",
  },
  {
    icon: "Sparkles",
    title: "Zero setup to start",
    body:
      "Your store domain is your sign-in. No app to install, no password to invent, no card. Your " +
      "first three pages are free.",
  },
];

export function WhatYouGet() {
  const ref = useSeen<HTMLElement>("get");

  return (
    <section
      ref={ref}
      id="get"
      className="scroll-mt-20 border-t border-pf-border px-5 py-20 sm:px-8 sm:py-24 lg:px-[120px]"
    >
      <div className="mx-auto max-w-[1200px]">
        <SectionHead eyebrow="What you get" title="Not a template. Your store, designed." />

        <ul className="mt-11 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item) => (
            <li
              key={item.title}
              className="flex flex-col gap-3 rounded-pf-lg border border-pf-border bg-pf-card p-6 pb-7 transition-colors hover:border-pf-border-hi"
            >
              <span className="text-pf-violet">
                <Icon name={item.icon} size={26} />
              </span>
              <h3 className="mt-1 font-display text-[20px] font-semibold tracking-[-0.01em] text-pf-text">
                {item.title}
              </h3>
              <p className="text-[15px] leading-relaxed text-pf-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
