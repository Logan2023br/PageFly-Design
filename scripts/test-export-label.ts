/* ==========================================================================
   ONE CARD IS EXPORTING; THE OTHERS ARE WAITING THEIR TURN.

       npx tsx scripts/test-export-label.ts

   TWO REPORTS, ONE FILE.

   1. Pressing Export on one page made every other card say "Exporting…".
   2. Pressing Export on one page stopped every other card being pressable at
      all: "bấm export xong nó không cho export ở item khác".

   The second is why the label now reads off a QUEUE rather than a boolean.
   Blocking is real — `capture` and `buildPagefly` stage into one offscreen
   node — but a shared resource wants a queue, not a locked screen.

   Neither bug fails anything: the export works and the right file downloads.
   The screen just says something untrue, or refuses a press it could have
   taken. So the assertions below are about what the merchant is TOLD.
   ========================================================================== */

import { actionLabel, placeOf } from "../components/results/exportLabel";

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

/* Three cards, pressed in this order. The provider works the list from the
   front, so "a" is converting and "b" and "c" are waiting. */
const QUEUE = ["a", "b", "c"];

head("where each card sits");
ok("the head of the queue is the one running", placeOf(QUEUE, "a") === "running");
ok("the one pressed second is waiting", placeOf(QUEUE, "b") === "queued");
ok("and so is the third", placeOf(QUEUE, "c") === "queued");
ok("a card nobody pressed is nowhere", placeOf(QUEUE, "d") === null);
ok("nor is anything in an empty queue", placeOf([], "a") === null);

head("what each card says");
ok(
  "the one converting says so",
  actionLabel("idle", placeOf(QUEUE, "a")) === "Exporting…",
  actionLabel("idle", placeOf(QUEUE, "a")),
);
ok(
  "THE WAITING ONES DO NOT CLAIM TO BE CONVERTING",
  actionLabel("idle", placeOf(QUEUE, "b")) !== "Exporting…",
  `${actionLabel("idle", placeOf(QUEUE, "b"))} — seven cards claiming to convert was the first bug`,
);
ok(
  "they say the press landed",
  actionLabel("idle", placeOf(QUEUE, "b")) === "Queued",
  actionLabel("idle", placeOf(QUEUE, "b")),
);
ok(
  "AND A CARD NOBODY PRESSED STILL OFFERS TO EXPORT",
  actionLabel("idle", placeOf(QUEUE, "d")) === "Export",
  `${actionLabel("idle", placeOf(QUEUE, "d"))} — this is the reported bug`,
);

head("nothing exporting");
ok("every card offers to export", actionLabel("idle", null) === "Export");

head("the outcome belongs to one card only");
/* `done` and `failed` are per-card state already; they outrank the queue on
   the card that was pressed — the file has arrived, whatever else is still
   running behind it. */
ok("done outranks the queue", actionLabel("done", "running") === "Exported");
ok("failed outranks the queue", actionLabel("failed", "running") === "Export failed");
ok("done while another card runs", actionLabel("done", null) === "Exported");

head("the queue is an order, and the order is the promise");
/* "ưu tiên những cái item bấm trước sẽ chạy trước" — first pressed, first run.
   A queue that reported its head as anything but position 0 would run them in
   an order the labels do not describe. */
const pressed = ["first", "second", "third"];
ok(
  "only one card is ever `running`",
  pressed.filter((id) => placeOf(pressed, id) === "running").length === 1,
);
ok(
  "and it is the one pressed first",
  placeOf(pressed, "first") === "running",
);

console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
