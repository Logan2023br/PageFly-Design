/* ==========================================================================
   ONE CARD IS EXPORTING; THE OTHERS ARE JUST WAITING.

       npx tsx scripts/test-export-label.ts

   REPORTED: pressing Export on one page made every other card on the screen
   say "Exporting…" too.

   `exporting` is one boolean on the provider, and every card read it. That
   boolean is doing two different jobs and only one of them belongs to
   everybody:

     BLOCKING IS SHARED, and correctly so. `capture` and `buildPagefly` both
     stage the page into ONE offscreen surface — `setStaged(page)`, measured
     through a single `stageRef` — so two exports at once fight over the same
     node. Every button stays disabled while one runs.

     THE LABEL IS NOT SHARED. "Exporting…" on a card that nobody pressed is the
     screen reporting work that is not happening to that page, and a merchant
     watching seven cards claim to be busy has no way to tell which download is
     actually coming.

   Nothing fails here either: the export works, the right file downloads. The
   screen just says something untrue for a few seconds.
   ========================================================================== */

import { actionLabel } from "../components/results/exportLabel";

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

head("while one card is exporting");
ok(
  "the card that was pressed says so",
  actionLabel("idle", true, true) === "Exporting…",
  actionLabel("idle", true, true),
);
ok(
  "AND THE OTHERS DO NOT",
  actionLabel("idle", true, false) === "Export",
  `${actionLabel("idle", true, false)} — this is the reported bug`,
);

head("nothing exporting");
ok("every card offers to export", actionLabel("idle", false, false) === "Export");
ok("including the last one pressed", actionLabel("idle", false, true) === "Export");

head("the outcome belongs to one card only");
/* `done` and `failed` are per-card state already; they must not be reachable
   for a card that was never pressed, and they outrank the busy flag on the one
   that was — the file has arrived, whatever else is still running. */
ok("done outranks busy", actionLabel("done", true, true) === "Exported");
ok("failed outranks busy", actionLabel("failed", true, true) === "Export failed");
ok("done on an idle screen", actionLabel("done", false, true) === "Exported");

console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
