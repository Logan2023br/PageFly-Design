import type { Brief } from "./validation";

/* ==========================================================================
   Which brief made this page?

   For one build the question is trivial — there is one brief and every page
   came from it. The Library is where it stops being trivial: `loadLibrary`
   rebuilds EVERY saved run into a single deck, each run has its own brief, and
   the store keeps one:

       brief: runs.at(-1)?.brief ?? null

   So a merchant reading page 3, built by run A, is looking at a store whose
   `brief` is run Z's. Anything that renders that field answers this question
   wrongly for every page outside the last run, and looks right doing it.

   A page carries `runId` only when it came from the Library. Absent means "the
   brief in state", which is exactly right when there is only one.

   A `runId` with no entry returns NULL, deliberately. Falling back to `current`
   would put run Z's brief under run A's page — the precise failure this
   function exists to prevent, reintroduced as a convenience.
   ========================================================================== */

/** A page, as far as this question is concerned. */
export type BriefOwner = { runId?: string };

export function briefForPage(
  page: BriefOwner,
  current: Brief | null,
  byRun: Record<string, Brief>,
): Brief | null {
  if (page.runId === undefined) return current;
  return byRun[page.runId] ?? null;
}
