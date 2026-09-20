/* ==========================================================================
   What a merchant is told when a build fails.

   ONE SENTENCE, AND IT NAMES NOBODY.

   This file used to do the opposite, and the reasoning was recorded here: a
   vendor failure — out of credit, a rejected key, rate limiting, an outage —
   names something someone can go and fix, so `fromStatus` had already written
   it for a reader and replacing it with "contact support" would send a
   merchant to us with a question their billing page answers.

   THE PREMISE WAS WRONG ABOUT WHOSE BILLING PAGE. The key is ours: `keyFor` in
   `lib/ai/provider.ts` reads it from this server's environment. A merchant has
   no account with the model vendor, nothing to top up, and no way to act on a
   402. What the argument actually produced was our stack's name and an HTTP
   status in red across their brief:

       DeepSeek is having an outage — nothing here is wrong. Try again
       shortly. (503)

   That message does have an audience. It is the operator, reading the log or
   the job row — where it still is, untouched. It was being shown to the one
   person who can do nothing with it, and it told them which model we run.

   So the flag no longer decides anything here: every failure becomes the same
   sentence. What a merchant can act on is the same either way — try again, and
   if it keeps failing, tell us.

   THE DETAIL IS NOT LOST. It stays in the job row's `failures` and in the
   build log, which is where support and the next person to read this actually
   look. The merchant's screen was never the right place to keep it.
   ========================================================================== */

/** A page that failed, as the build runner records it. */
export type BuildFailure = {
  reason: string;
  /**
   * True when the reason came from the vendor rather than from a bad answer.
   *
   * Still recorded, still written to the job row, and deliberately no longer
   * read by `merchantMessage`: it is how an operator tells "they were down"
   * from "we sent something unusable", and neither is the merchant's to fix.
   */
  vendorFault?: boolean;
};

/** The only thing a failed build says on a merchant's screen. */
export const BUILD_FAILED = "The build did not go through. Please try again.";

export function merchantMessage(failure: BuildFailure | undefined): string {
  void failure;
  return BUILD_FAILED;
}

/**
 * The per-page failures, with their reasons taken out.
 *
 * WHY HERE AND NOT AT EACH SCREEN. Three of them printed `reason` straight to
 * the merchant — the sticky bar under the brief, the card on the generating
 * screen, and the list on the results screen — so a fix at the call site is
 * three fixes and an invitation to write a fourth. `app/api/build/route.ts`
 * is the one place a job crosses to the browser; blanked there, no screen has
 * anything to leak.
 *
 * The page and its label stay: "we could not build Home and Collection" is
 * information a merchant can use. "…because the model returned 37983 tokens of
 * something that was not JSON" is not.
 */
export function merchantFailures(
  list: unknown,
): { pageId: string; label: string; reason: string }[] {
  if (!Array.isArray(list)) return [];
  return list.map((f) => {
    const row = (f ?? {}) as { pageId?: unknown; label?: unknown };
    return {
      pageId: typeof row.pageId === "string" ? row.pageId : "",
      label: typeof row.label === "string" ? row.label : "",
      reason: "",
    };
  });
}
