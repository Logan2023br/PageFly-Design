"use client";

import Link from "next/link";
import { useState } from "react";
import { SHOWCASE_SETS, type ShowcasePage } from "@/lib/showcasePages";
import { Icon } from "../ui";
import { PageThumb, PageViewer } from "../landing/PagePreview";

/* ==========================================================================
   ONE SET, EVERY PAGE, AND EACH OPENS FULL SIZE.

   Looked up by id rather than handed the set: the route is a server component
   and the set is a plain value in `lib/showcasePages.ts`, so passing the id is
   the whole of what crosses the boundary.
   ========================================================================== */
export function SetDetail({ setId }: { setId: string }) {
  const set = SHOWCASE_SETS.find((s) => s.id === setId)!;
  const [open, setOpen] = useState<ShowcasePage | null>(null);

  return (
    <>
      <Link
        href="/collection-pages"
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-pf-muted transition-colors hover:text-pf-text"
      >
        <Icon name="ArrowLeft" size={14} />
        All sets
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-pf-border pb-6">
        <div className="max-w-[720px]">
          <h1 className="font-display text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-pf-text sm:text-[40px]">
            {set.name}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-pf-muted">{set.blurb}</p>
        </div>
        <span className="text-[13px] font-medium text-pf-faint">{set.pages.length} pages</span>
      </div>

      {/* Other sets, one press away, so moving between them does not mean going
          back to the list first. */}
      <div className="mt-6 flex flex-wrap gap-2">
        {SHOWCASE_SETS.map((other) => (
          <Link
            key={other.id}
            href={`/collection-pages/${other.id}`}
            aria-current={other.id === set.id ? "page" : undefined}
            className={
              "rounded-pf-pill border px-4 py-[9px] text-[14px] transition-colors " +
              (other.id === set.id
                ? "border-pf-border-hi bg-pf-card-hi font-semibold text-pf-text"
                : "border-pf-border font-medium text-pf-muted hover:border-pf-border-hi hover:text-pf-text")
            }
          >
            {other.name}
          </Link>
        ))}
      </div>

      <ul className="mt-8 grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {set.pages.map((page) => (
          <li key={page.slug}>
            <figure className="group relative m-0 overflow-hidden rounded-pf-card border border-pf-border bg-pf-card shadow-pf-card transition-colors hover:border-pf-primary-hi/50">
              <span className="relative block aspect-[3/4]">
                <PageThumb set={set} page={page} lazy />
              </span>
              <button
                type="button"
                onClick={() => setOpen(page)}
                aria-label={`Open the ${set.name} ${page.label} page`}
                className="absolute inset-x-0 top-0 z-10 block aspect-[3/4] w-full cursor-pointer"
              />
              <span className="pointer-events-none absolute inset-x-0 top-0 z-20 flex aspect-[3/4] items-end justify-center gap-1.5 bg-gradient-to-t from-pf-bg/85 to-transparent pb-3 text-[11.5px] font-semibold text-pf-text opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <Icon name="Maximize" size={12} />
                Open the page
              </span>
              <figcaption className="border-t border-pf-border px-3.5 py-3">
                <span className="block text-[13.5px] font-semibold text-pf-text">{page.label}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-pf-faint">
                  {page.blurb}
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      {open && (
        <PageViewer set={set} page={open} from="collection_pages" onClose={() => setOpen(null)} />
      )}
    </>
  );
}
