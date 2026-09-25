/* ==========================================================================
   PRESS AS MANY AS YOU LIKE; THEY RUN IN THE ORDER YOU PRESSED THEM.

       npx tsx scripts/test-export-queue.ts

   REPORTED: "bấm export xong nó không cho export ở item khác" — one export
   locked every other card. The ask was precise: accept the press, show it
   waiting, download each file as it is ready, and run them in press order.

   FOUR RULES, AND ALL FOUR FAIL QUIETLY:

     ONE AT A TIME   two jobs overlapping both finish and both download; the
                     one that lost the shared staging node has the wrong
                     layout inside it, which no error reports
     IN ORDER        a queue that runs newest-first still empties, just not in
                     the order the labels on screen describe
     ONCE EACH       a double press that queues twice converts the same page
                     twice — two minutes and twenty cents, and two identical
                     files in the merchant's downloads folder
     KEEP GOING      a loop that stops at the first failure strands every page
                     behind it, and they sit on "Queued" for ever

   So the fixture records what actually ran, in the order it ran, and checks
   the recording rather than the queue's own opinion of itself.
   ========================================================================== */

import { createExportQueue } from "../components/results/exportQueue";

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

const tick = () => new Promise((r) => setTimeout(r, 5));

async function main(): Promise<void> {
  /* ---- 1 · order, and one at a time ------------------------------------- */
  head("three cards pressed while the first is still converting");

  const log: string[] = [];
  let inFlight = 0;
  let overlapped = false;
  const seen: string[][] = [];

  const q = createExportQueue((ids) => seen.push(ids));

  /* Deliberately UNEVEN durations. With equal waits an out-of-order queue can
     still finish in order by luck; making the first job the slowest means a
     queue that does not hold its order will visibly reverse. */
  const job = (id: string, ms: number) => () =>
    new Promise<void>((resolve) => {
      inFlight += 1;
      if (inFlight > 1) overlapped = true;
      log.push(`start:${id}`);
      setTimeout(() => {
        log.push(`end:${id}`);
        inFlight -= 1;
        resolve();
      }, ms);
    });

  const a = q.add("a", job("a", 40));
  const b = q.add("b", job("b", 5));
  const c = q.add("c", job("c", 5));

  /* THE PRESS IS ACCEPTED IMMEDIATELY. This is the whole report: pressing the
     second card while the first runs must land, not be refused. */
  ok("all three presses landed", q.ids().join(",") === "a,b,c", q.ids().join(","));
  ok("and the one pressed first is at the head", q.ids()[0] === "a");

  await Promise.all([a, b, c]);

  ok("NOTHING EVER OVERLAPPED", !overlapped, "two at once share one staging node");
  ok(
    "and they ran in the order they were pressed",
    log.join(" ") === "start:a end:a start:b end:b start:c end:c",
    log.join(" "),
  );
  ok("the queue is empty afterwards", q.ids().length === 0);

  /* The head is only removed once its work is done — or a converting card
     reads as idle while the card behind it claims to be running. */
  ok(
    "the running job stayed at the head until it finished",
    seen.some((ids) => ids[0] === "a" && ids.length === 3),
    JSON.stringify(seen),
  );

  /* ---- 2 · a second press is not a second file -------------------------- */
  head("the same card pressed twice");

  let runs = 0;
  const q2 = createExportQueue(() => {});
  const slow = () => new Promise<void>((r) => setTimeout(() => { runs += 1; r(); }, 20));

  const first = q2.add("x", slow);
  const again = q2.add("x", slow);
  ok("it is queued once, not twice", q2.ids().length === 1, q2.ids().join(","));
  await Promise.all([first, again]);
  ok("AND IT CONVERTED ONCE", runs === 1, `${runs} conversions`);

  /* ---- 3 · one failure must not strand the rest ------------------------- */
  head("the first page fails");

  const done: string[] = [];
  const q3 = createExportQueue(() => {});
  const bang = q3.add("bad", async () => {
    throw new Error("conversion failed");
  });
  const fine = q3.add("good", async () => {
    done.push("good");
  });

  let told = false;
  await bang.catch(() => {
    told = true;
  });
  await fine;

  ok("the card that failed is told", told, "or it would sit on `Exporting…` for ever");
  ok("AND THE PAGE BEHIND IT STILL RAN", done.join(",") === "good", done.join(","));
  ok("the queue drained", q3.ids().length === 0);

  /* ---- 4 · a press that arrives after the queue went idle ---------------- */
  head("pressing again once everything has finished");

  const q4 = createExportQueue(() => {});
  const ran: string[] = [];
  await q4.add("one", async () => { ran.push("one"); });
  await tick();
  /* THE WORKER HAS TO RESTART. It stops when the list empties; a flag left set
     would mean the next press is queued and never picked up — a card stuck on
     "Queued" with nothing running. */
  await q4.add("two", async () => { ran.push("two"); });
  ok("the worker restarts for a later press", ran.join(",") === "one,two", ran.join(","));

  console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
  process.exit(bad === 0 ? 0 : 1);
}

void main();
