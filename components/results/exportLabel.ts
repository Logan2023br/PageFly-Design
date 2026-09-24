/* ==========================================================================
   WHAT THE EXPORT BUTTON SAYS.

   ITS OWN FILE SO IT CAN BE TESTED, and it needed testing because it was
   wrong: `exporting` is one boolean on the provider and every card read it, so
   pressing Export on one page made all seven say "Exporting…".

   That boolean does two jobs and only one is everybody's. BLOCKING is shared —
   `capture` and `buildPagefly` stage into a single offscreen surface, so two
   exports at once fight over the same node and every button must stay
   disabled. THE LABEL is not: a card nobody pressed claiming to be busy is the
   screen reporting work that is not happening to that page.
   ========================================================================== */

export type ExportState = "idle" | "done" | "failed";

/**
 * @param state   this card's own outcome, which outranks everything
 * @param busy    an export is running somewhere on the screen
 * @param mine    that export is this card's
 */
export function actionLabel(state: ExportState, busy: boolean, mine: boolean): string {
  /* The file has arrived, or it has not; either answer belongs to this card
     and is truer than "still going" — which may be about a different page. */
  if (state === "done") return "Exported";
  if (state === "failed") return "Export failed";
  return busy && mine ? "Exporting…" : "Export";
}
