/* ==========================================================================
   WHAT THE EXPORT BUTTON SAYS.

   ITS OWN FILE SO IT CAN BE TESTED, and it has now been wrong twice.

   FIRST: `exporting` was one boolean on the provider and every card read it,
   so pressing Export on one page made all seven say "Exporting…" — the screen
   reporting work that was not happening to those pages.

   SECOND, and the reason this was rewritten: that same boolean also DISABLED
   every other card, so a merchant who wanted three files had to watch the
   first finish before they could ask for the second. The blocking was real —
   `capture` and `buildPagefly` stage into a single offscreen node, and two at
   once fight over it — but the answer to a shared resource is a QUEUE, not a
   locked screen.

   SO A CARD IS NOW IN ONE OF THREE PLACES, and the label is a lookup:

     null        not asked for
     "queued"    asked for, waiting its turn — the click was accepted
     "running"   the one actually converting right now

   THE DISTINCTION IS NOT COSMETIC. Every waiting card saying "Exporting…"
   would be the first bug again in a new shape: seven cards claiming to be
   converting when one is, and no way to tell which download is coming next.
   "Queued" is the truth and it is also the reassurance — the press landed.
   ========================================================================== */

export type ExportState = "idle" | "done" | "failed";

/** Where a card sits in the export queue, or null when it is not in it. */
export type QueuePlace = "queued" | "running" | null;

/**
 * @param state this card's own outcome, which outranks everything
 * @param place where this card sits in the queue — see `QueuePlace`
 */
export function actionLabel(state: ExportState, place: QueuePlace): string {
  /* The file has arrived, or it has not; either answer belongs to this card
     and is truer than "still going" — which may be about a different page. */
  if (state === "done") return "Exported";
  if (state === "failed") return "Export failed";
  if (place === "running") return "Exporting…";
  if (place === "queued") return "Queued";
  return "Export";
}

/**
 * Where one page sits in the queue.
 *
 * THE HEAD OF THE QUEUE IS THE RUNNING ONE. The provider works through the
 * list in order and shifts a job off only once it has finished, so `queue[0]`
 * is not "next" — it is the one in progress. Deriving the label from that
 * rather than from a second `runningId` keeps one source of truth: two fields
 * could disagree, and the disagreement would show as a card stuck on
 * "Queued" while its file quietly downloaded.
 */
export function placeOf(queue: readonly string[], id: string): QueuePlace {
  const at = queue.indexOf(id);
  if (at === -1) return null;
  return at === 0 ? "running" : "queued";
}
