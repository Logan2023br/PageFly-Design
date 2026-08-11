"use client";

import { designPage } from "./designPage";
import { rewritePageCopy } from "./rewritePage";
import type { Brief } from "../validation";
import type { PageMockup } from "../generate/types";

/* ==========================================================================
   Everything a model is allowed to do to one page, in order, with the rule for
   when it stops.

   Two things a model can do here and they are alternatives, not a sequence:

     designPage      lays the page out from scratch — its own sections, its own
                     layout, its own words
     rewritePageCopy keeps the generator's layout and replaces only the words

   The designer runs first. If it delivers, the page is entirely its own and
   there is nothing left for the copywriter to improve; running it anyway would
   spend a second call rewriting text that was written for the layout it sits
   in, which is how copy stops fitting the space it was measured for.

   If the designer declines — no model, timeout, tree rejected, output too thin
   — the copywriter runs on the deterministic page instead. That is the older,
   cheaper, duller product, and it is a complete one.

   So a page ends in one of three states, best first:

     model designed it        layout and words both the model's
     model rewrote the copy   generator's layout, model's words
     neither                  the deterministic page, unchanged and correct
   ========================================================================== */

export type ImproveResult = {
  page: PageMockup;
  /** which stage produced the page on screen */
  via: "design" | "copy" | "none";
  tokens: number;
  reason?: string;
};

export async function improvePage(
  page: PageMockup,
  brief: Brief,
  signal?: AbortSignal,
): Promise<ImproveResult> {
  const designed = await designPage(page, brief, signal);
  if (designed.used)
    return { page: designed.page, via: "design", tokens: designed.tokens };

  /* The merchant cancelled — not a failure, and not worth a second call. */
  if (signal?.aborted)
    return { page, via: "none", tokens: designed.tokens, reason: designed.reason };

  const rewritten = await rewritePageCopy(page, brief, signal);
  return {
    page: rewritten.page,
    via: rewritten.used ? "copy" : "none",
    /* Both attempts are billed, so both are reported. A build that fell back
       still spent the designer's input tokens. */
    tokens: designed.tokens + rewritten.tokens,
    reason: rewritten.used ? designed.reason : (rewritten.reason ?? designed.reason),
  };
}
