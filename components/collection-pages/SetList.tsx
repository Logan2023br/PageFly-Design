"use client";

import Link from "next/link";
import { pagesLabel, type PublicCollectionSet } from "@/lib/collectionPages";
import { Icon } from "../ui";
import { PageThumb } from "../landing/PagePreview";
import { SetAction } from "./SetAction";

/* ==========================================================================
   EVERY SET, ONE CARD EACH — FREE FIRST, THEN PREMIUM.

   Two groups under their own headings, because the two are different offers
   and a mixed grid makes a visitor read every card's corner to learn which is
   which. Free comes first: it is what most visitors came for, and it earns the
   trust the premium row then asks for. A group with nothing in it is left out
   rather than shown empty.

   The card's picture is the set's first page — its Home, the cover a merchant
   would meet the store by — and the chips under it name the rest.
   ========================================================================== */
export function SetList({ sets }: { sets: PublicCollectionSet[] }) {
  const free = sets.filter((s) => s.access === "free");
  const paid = sets.filter((s) => s.access === "paid");

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

      {sets.length === 0 && (
        <p className="mt-12 text-[15px] text-pf-muted">No sets are published yet — check back soon.</p>
      )}

      {free.length > 0 && (
        <Group
          eyebrow="Free to download"
          title="Free page sets"
          sub="Every page is yours to keep. Download a whole set in one file and import it straight into your PageFly editor — no cost, no sign-up."
          sets={free}
        />
      )}

      {paid.length > 0 && (
        <Group
          eyebrow="Premium templates"
          title="Premium page sets"
          sub="Fuller stores with more pages and more polish. Preview every page for free — when you buy, we check your order and send the files to your email."
          sets={paid}
          premium
        />
      )}
    </>
  );
}

function Group({
  eyebrow,
  title,
  sub,
  sets,
  premium = false,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  sets: PublicCollectionSet[];
  premium?: boolean;
}) {
  return (
    <section className="mt-14 border-t border-pf-border pt-10 first-of-type:mt-12">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="max-w-[680px]">
          <p
            className={`flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] ${
              premium ? "text-pf-warn" : "text-pf-primary-hi"
            }`}
          >
            <Icon name={premium ? "Star" : "Download"} size={13} />
            {eyebrow}
          </p>
          <h2 className="mt-2 font-display text-[24px] font-bold tracking-[-0.015em] text-pf-text sm:text-[28px]">
            {title}
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-pf-muted">{sub}</p>
        </div>
        <span className="text-[13px] font-medium text-pf-faint">
          {sets.length} {sets.length === 1 ? "set" : "sets"}
        </span>
      </div>

      <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sets.map((set) => (
          <li key={set.id} className="relative">
            <Link
              href={`/collection-pages/${set.id}`}
              className={`group flex h-full flex-col overflow-hidden rounded-pf-card border bg-pf-card shadow-pf-card transition-colors ${
                premium
                  ? "border-pf-warn/25 hover:border-pf-warn/60"
                  : "border-pf-border hover:border-pf-primary-hi/50"
              }`}
            >
              <span className="relative block aspect-[4/3] overflow-hidden">
                <PageThumb set={set} page={set.pages[0]} />
                <span className="pointer-events-none absolute inset-0 flex items-end justify-center gap-1.5 bg-gradient-to-t from-pf-bg/85 to-transparent pb-3 text-[12px] font-semibold text-pf-text opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <Icon name="LayoutGrid" size={13} />
                  {set.pages.length === 1 ? "See the page" : `See all ${set.pages.length} pages`}
                </span>
              </span>
              <span className="flex flex-1 flex-col border-t border-pf-border px-4 py-4">
                <span className="flex items-center justify-between gap-3">
                  <span className="font-display text-[18px] font-semibold tracking-[-0.011em] text-pf-text">
                    {set.name}
                  </span>
                  <span className="shrink-0 text-[12px] font-medium text-pf-faint">
                    {premium ? (
                      <span className="font-semibold text-pf-warn">{set.price ?? "Paid"}</span>
                    ) : (
                      "Free"
                    )}
                    {" · "}
                    {pagesLabel(set.pages.length)}
                  </span>
                </span>
                {set.blurb && (
                  <span className="mt-1 block text-[13px] leading-snug text-pf-faint">
                    {set.blurb}
                  </span>
                )}
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
            {/* Over the card's picture, and a sibling of the card's link rather
                than inside it: a link inside a link is invalid, and a press on
                it would also navigate. */}
            <div className="absolute right-3 top-3 z-10">
              <SetAction set={set} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
