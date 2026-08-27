import "server-only";

import { getRepo } from "./db";
import type { PageMockup } from "./generate/types";
import { normalizeDomain } from "./sheet";

/* ==========================================================================
   THE PAGES ON THE FRONT DOOR.

   Everything in the database belongs to a real store. A showcase that reached
   for "the most recent runs" would publish a merchant's work on a page anyone
   can open — by default, silently, and with no way for them to know. So the
   source is always named explicitly. There are two ways to name it.

   ONE STORE, whose Library is the front door:

       SHOWCASE_STORE=ts.myshopify.com

   This is the default, compiled in below, and it exists because the run-id list
   under it did not survive contact with a deployment. Run ids are generated per
   database, so a list copied from a dev machine names six runs production has
   never heard of — which is exactly what happened, twice, and the marquee was
   empty both times with nothing saying why. A DOMAIN is the same explicit
   opt-in and it means the same thing everywhere.

   The store named here is a demo store belonging to the person deploying this.
   Pointing it at a real merchant's domain publishes their work; the safety
   property is that somebody has to type the domain, not that ids are opaque.

   SPECIFIC RUNS, when the newest are not the ones worth showing:

       SHOWCASE_RUNS=xuyzjaea95sx,itoai81mx3d1t,bqjcr599d6i8

   This WINS when set, because naming runs is more specific than naming a store.
   Set `SHOWCASE_STORE=` to empty to turn the showcase off entirely — an empty
   front door is recoverable and a published customer page is not.

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

/**
 * The demo store the front door shows when no runs are named.
 *
 * Compiled in rather than left to the environment for the reason the docblock
 * gives: this has now been empty on production twice because a value lived only
 * in a `.env.local`. A default in the repo is a default that deploys.
 */
const BUILTIN_SHOWCASE_STORE = "ts.myshopify.com";

/**
 * How many pages the marquee may carry.
 *
 * Each one is about 22KB of design tree, so this is the difference between a
 * 265KB landing page and an unbounded one — a store with thirty runs would
 * otherwise put every page it has ever built on the front door. Twelve fills
 * two rows with six each, which is what reads as a body of work.
 */
const MAX_SHOWCASE_PAGES = 12;

export function showcaseIds(): string[] {
  return (process.env.SHOWCASE_RUNS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The store whose Library is on the front door, or null for no showcase.
 *
 * An explicitly empty `SHOWCASE_STORE=` turns it off; unset falls back to the
 * built-in. Those are different intentions and `??` cannot tell them apart,
 * which is why this checks for `undefined` rather than falsiness.
 */
export function showcaseStore(): string | null {
  const raw = process.env.SHOWCASE_STORE;
  if (raw === undefined) return BUILTIN_SHOWCASE_STORE;
  const domain = normalizeDomain(raw);
  return domain.includes(".") ? domain : null;
}

/** Which of the two sources is in play, for `/api/health` to report. */
export function showcaseSource(): "runs" | "store" | "none" {
  if (showcaseIds().length > 0) return "runs";
  return showcaseStore() ? "store" : "none";
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
  const store = showcaseStore();
  const ids = showcaseIds();

  if (ids.length > 0) {
    const named = await fromNamedRuns(ids);
    if (named.length > 0) return named;

    /* EVERY named run missing means the list is about another database, not
       about this one — which is the exact state that left production with an
       empty marquee while a stale list of dev ids sat in its environment. A list
       that names nothing findable is no more specific than no list at all, so
       the store takes over rather than the front door staying empty. One id of
       six being wrong still wins on the five that resolve; this is only the case
       where none do. `/api/health` reports the numbers either way. */
    if (store) return fromStore(store);
    return [];
  }

  if (!store) return [];
  return fromStore(store);
}

/**
 * The named runs, in the order the ids were listed.
 *
 * A named run that no longer exists is skipped rather than fatal. The front
 * door failing because a demo run was deleted months ago is a worse outcome
 * than a shorter marquee, and nobody would notice the cause for weeks.
 */
async function fromNamedRuns(ids: string[]): Promise<ShowcasePage[]> {
  const repo = getRepo();
  const out: ShowcasePage[] = [];

  for (const id of ids) {
    if (out.length >= MAX_SHOWCASE_PAGES) break;
    const run = await repo.getRun(id).catch(() => null);
    if (!run) continue;
    out.push(...pagesOf(run.snapshot, MAX_SHOWCASE_PAGES - out.length));
  }

  return out;
}

/**
 * One store's Library, newest build first.
 *
 * Sorted here rather than trusted from the driver: `listRuns` makes no promise
 * about order, and "newest first" is the whole point — a demo store's most
 * recent build is the one worth showing, and an unsorted list would freeze the
 * front door on whatever the first run happened to be.
 */
async function fromStore(domain: string): Promise<ShowcasePage[]> {
  const runs = await getRepo().listRuns(domain).catch(() => []);

  const newestFirst = [...runs].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );

  const out: ShowcasePage[] = [];
  for (const run of newestFirst) {
    if (out.length >= MAX_SHOWCASE_PAGES) break;
    out.push(...pagesOf(run.snapshot, MAX_SHOWCASE_PAGES - out.length));
  }
  return out;
}

/** The drawable pages in one run's snapshot, at most `room` of them. */
function pagesOf(snapshot: unknown, room: number): ShowcasePage[] {
  if (!Array.isArray(snapshot)) return [];

  const out: ShowcasePage[] = [];
  for (const page of snapshot as PageMockup[]) {
    if (out.length >= room) break;
    /* A page with no design tree is a page the model never built — it would
       draw as an empty card, which is worse than one fewer card. */
    if (!page?.design?.tree) continue;
    out.push(strip(page));
  }
  return out;
}
