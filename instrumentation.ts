/* ==========================================================================
   Runs once when a server instance starts.

   Starts the Upsell Build Pages housekeeping timer (stale builds back to the
   queue, expired files purged, Slack batches flushed). Node runtime only, and
   it does nothing without Postgres — see lib/upsell/maintenance.ts.
   ========================================================================== */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startUpsellTimer } = await import("./lib/upsell/maintenance");
  startUpsellTimer();
}
