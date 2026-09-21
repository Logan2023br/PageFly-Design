/* ==========================================================================
   The .pagefly file is built while the merchant is still reading the mockup.

       npx tsx scripts/test-prepared.ts

   Converting an HTML mockup costs a model call per band — a minute or so, and
   about a third of a million tokens. It ran on the Export click, so a merchant
   who had already waited for the build waited again for the file, and the six
   exports of one page in a real log were six full conversions of a document
   that had not changed.

   So it starts when the page appears and the click collects it. Four things
   have to hold, and none of them is obvious enough to leave to the component:

     the same page is never converted twice
     a click DURING the conversion waits for it rather than starting a second
     conversions run one at a time — four pages at ten bands each is forty
       parallel model calls otherwise
     a conversion that fails is not cached as an answer
   ========================================================================== */
import { createPreparer } from "../lib/pagefly/prepared";

let bad = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad += 1;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log("\nthe work happens once");

  let runs = 0;
  const once = createPreparer<string, string>(async (input) => {
    runs += 1;
    await wait(10);
    return `built:${input}`;
  });

  const a = once.start("k1", "page-one");
  const b = once.start("k1", "page-one");
  check(a === b, "a second ask for the same page is the same piece of work");
  check(await a === "built:page-one", "and it answers with the file", await a);
  check(runs === 1, "the model ran once", String(runs));

  /* The click that arrives late gets the answer without doing anything. */
  const c = await once.start("k1", "page-one");
  check(c === "built:page-one" && runs === 1, "and a later click just collects it", String(runs));

  console.log("\nand one at a time");

  const order: string[] = [];
  const queued = createPreparer<string, string>(async (input) => {
    order.push(`start:${input}`);
    await wait(20);
    order.push(`end:${input}`);
    return input;
  });
  const p1 = queued.start("a", "a");
  const p2 = queued.start("b", "b");
  await Promise.all([p1, p2]);
  check(
    order.join(" ") === "start:a end:a start:b end:b",
    "the second waits for the first to finish",
    order.join(" "),
  );

  console.log("\nwhat is ready, and what failed");

  const slow = createPreparer<string, string>(async () => {
    await wait(15);
    return "done";
  });
  const pending = slow.start("s", "s");
  check(slow.ready("s") === false, "a page still converting is not ready");
  await pending;
  check(slow.ready("s") === true, "and is once it has finished");
  check(slow.ready("never-asked") === false, "a page nobody started is not ready either");

  /* A CONVERSION THAT FAILED IS NOT AN ANSWER. Cached as one, the merchant
     gets the same failure for as long as the tab is open, with no way to ask
     again — and the export path has a fallback converter that would have
     worked. */
  let attempts = 0;
  const flaky = createPreparer<string, string>(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("vendor down");
    return "second time";
  });
  let first: unknown = null;
  try {
    await flaky.start("f", "f");
  } catch (err) {
    first = err;
  }
  check(first instanceof Error, "a failure reaches the caller", String(first));
  check(await flaky.start("f", "f") === "second time", "and asking again tries again", String(attempts));
  check(flaky.ready("f") === true, "and then it is ready");

  console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
  if (bad > 0) process.exitCode = 1;
}

void main();
