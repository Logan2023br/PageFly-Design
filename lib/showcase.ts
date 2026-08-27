import "server-only";

import { getRepo } from "./db";
import type { PageMockup } from "./generate/types";

/* ==========================================================================
   THE PAGES ON THE FRONT DOOR.

   Everything in the database belongs to a real store. A showcase that reached
   for "the most recent runs" would publish a merchant's work on a page anyone
   can open — by default, silently, and with no way for them to know. So this
   reads an explicit list and nothing else:

       SHOWCASE_RUNS=xuyzjaea95sx,itoai81mx3d1t,bqjcr599d6i8

   Unset means no showcase. That is the correct behaviour on a fresh deploy,
   not a bug to work around: an empty front door is recoverable and a published
   customer page is not.

   WHAT IS RETURNED IS ALSO A DECISION. A run holds the brief, the merchant's
   own words about their business, and the domain it was built for. None of that
   is needed to draw a card, so none of it leaves here — the filter is on the way
   OUT rather than a promise about who calls it.
   ========================================================================== */

/** One page, stripped to what a card needs to draw itself. */
export type ShowcasePage = Pick<
  PageMockup,
  "id" | "pageType" | "label" | "category" | "categoryLabel" | "index" | "tokens" | "vertical"
> & {
  copyIndex?: number;
  copyTotal?: number;
  design?: PageMockup["design"];
  blocks?: PageMockup["blocks"];
  refHints?: PageMockup["refHints"];
  seed?: number;
  variant?: number;
};

export function showcaseIds(): string[] {
  return (process.env.SHOWCASE_RUNS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Everything a card needs, and nothing a merchant would mind being seen.
 *
 * Written as a pick rather than a delete: a `delete page.domain` keeps every
 * field somebody adds later, and the field somebody adds later is exactly the
 * one that should not have been published.
 */
function strip(page: PageMockup): ShowcasePage {
  return {
    id: page.id,
    pageType: page.pageType,
    label: page.label,
    category: page.category,
    categoryLabel: page.categoryLabel,
    index: page.index,
    ...(page.copyIndex !== undefined ? { copyIndex: page.copyIndex } : {}),
    ...(page.copyTotal !== undefined ? { copyTotal: page.copyTotal } : {}),
    tokens: page.tokens,
    vertical: page.vertical,
    ...(page.design ? { design: page.design } : {}),
    ...(page.blocks ? { blocks: page.blocks } : {}),
    ...(page.refHints ? { refHints: page.refHints } : {}),
    ...(typeof page.seed === "number" ? { seed: page.seed } : {}),
    ...(typeof page.variant === "number" ? { variant: page.variant } : {}),
  };
}

/**
 * The showcase, in the order the ids were listed.
 *
 * A named run that no longer exists is skipped rather than fatal. The front
 * door failing because a demo run was deleted months ago is a worse outcome
 * than a shorter marquee, and nobody would notice the cause for weeks.
 */
export async function showcasePages(): Promise<ShowcasePage[]> {
  const ids = showcaseIds();
  if (ids.length === 0) return [];

  const repo = getRepo();
  const out: ShowcasePage[] = [];

  for (const id of ids) {
    const run = await repo.getRun(id).catch(() => null);
    if (!run) continue;

    const snapshot = run.snapshot;
    if (!Array.isArray(snapshot)) continue;

    for (const page of snapshot as PageMockup[]) {
      /* A page with no design tree is a page the model never built — it would
         draw as an empty card, which is worse than one fewer card. */
      if (!page?.design?.tree) continue;
      out.push(strip(page));
    }
  }

  return out;
}
