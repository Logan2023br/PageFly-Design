/* ==========================================================================
   What a failed build says to the merchant.

   Two kinds of failure arrive here and only one of them has an audience.

   A vendor failure — out of credit, a rejected key, rate limiting, an outage —
   names something someone can go and fix, and `provider.ts`'s `fromStatus`
   has already written it for a reader. Replacing those with "contact support"
   would send a merchant to us with a question their billing page answers.

   Everything else is our page designer answering in a shape we cannot use: an
   empty completion, a JSON stream that stopped, a tree that failed validation.
   "model did not return JSON — 37983 output tokens, answer began …" tells a
   merchant only that we are broken, in a language they did not ask to learn.
   That becomes one sentence and a way to reach us.

   THE DETAIL IS NOT LOST. It stays in the job row's `failures` and in the
   build log, which is where support and the next person to read this actually
   look — the merchant's screen was never the right place to keep it.

   The FLAG decides, not the words. Matching the reason's prose would break the
   first time a vendor rewords a message, and it is prose we do not own.
   ========================================================================== */

/** A page that failed, as the build runner records it. */
export type BuildFailure = {
  reason: string;
  /** true when the reason came from the vendor rather than from a bad answer */
  vendorFault?: boolean;
};

export const SUPPORT_MESSAGE =
  "This page type could not be built. Please contact support and we will look into it.";

/** No page failed by name — the designer was never reached at all. */
export const UNREACHABLE_MESSAGE =
  "The page designer could not be reached. No pages were built.";

export function merchantMessage(failure: BuildFailure | undefined): string {
  const reason = failure?.reason.trim();
  if (!reason) return UNREACHABLE_MESSAGE;
  return failure?.vendorFault ? reason : SUPPORT_MESSAGE;
}
