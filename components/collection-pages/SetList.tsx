"use client";

import Link from "next/link";
import { SHOWCASE_SETS } from "@/lib/showcasePages";
import { Icon } from "../ui";
import { PageThumb } from "../landing/PagePreview";

/* ==========================================================================
   EVERY SET, ONE CARD EACH.

   The card's picture is the set's first page — its Home, which is the cover a
   merchant would meet the store by — and the chips under it name the rest, so
   what pressing it opens is stated before it is pressed.
   ========================================================================== */
export function SetList() {
  return (
    <>
      <div className="max-w-[720px]">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-pf-primary-hi">
          Collection pages
        </p>
        <h1 className="mt-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.02em] text-pf-text sm:text-[44px]">
          Complete page sets, one store each.
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-pf-muted">
          Pick a set to see every page in it, then open any page to read the full mockup at
          desktop, tablet and mobile widths.
        </p>
      </div>

      <ul className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {SHOWCASE_SETS.map((set) => (
          <li key={set.id}>
            <Link
              href={`/collection-pages/${set.id}`}
              className="group flex h-full flex-col overflow-hidden rounded-pf-card border border-pf-border bg-pf-card shadow-pf-card transition-colors hover:border-pf-primary-hi/50"
            >
              <span className="relative block aspect-[4/3] overflow-hidden">
                <PageThumb set={set} page={set.pages[0]} />
                <span className="pointer-events-none absolute inset-0 flex items-end justify-center gap-1.5 bg-gradient-to-t from-pf-bg/85 to-transparent pb-3 text-[12px] font-semibold text-pf-text opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <Icon name="LayoutGrid" size={13} />
                  See all {set.pages.length} pages
                </span>
              </span>
              <span className="flex flex-1 flex-col border-t border-pf-border px-4 py-4">
                <span className="flex items-center justify-between gap-3">
                  <span className="font-display text-[18px] font-semibold tracking-[-0.011em] text-pf-text">
                    {set.name}
                  </span>
                  <span className="shrink-0 text-[12px] font-medium text-pf-faint">
                    {set.pages.length} pages
                  </span>
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-pf-faint">
                  {set.blurb}
                </span>
                <span className="mt-4 flex flex-wrap gap-1.5">
                  {set.pages.map((page) => (
                    <span
                      key={page.slug}
                      className="rounded-pf-pill border border-pf-border px-2.5 py-1 text-[11.5px] font-medium text-pf-muted"
                    >
                      {page.label}
                    </span>
                  ))}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
