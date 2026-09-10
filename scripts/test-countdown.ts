/* ==========================================================================
   A timer that has already finished.

       npx tsx scripts/test-countdown.ts

   `countdown` is the one element in the vocabulary whose correctness depends
   on WHEN the page is built. Every other element is judged against the tree
   alone; this one is judged against the calendar, and nothing was doing that.

   THREE THINGS LINED UP. The contract and the stage-2 prompt both carry the
   same worked example — `2026-11-24T23:59:00Z`, Black Friday. Neither prompt
   tells the model what day it is. And the schema's only rule for `endsAt` is
   `Date.parse` not returning NaN, which a date in 1999 passes.

   So a model with no clock, shown one date, writes that date. It renders as
   four zeros the moment Black Friday passes, and every page built after it
   carries a dead timer that nobody in the pipeline objects to.

   The repair call can fix this — it fixes what the audit names, and the audit
   never named it. Pure function: `now` is a parameter, so the test does not
   depend on the day it runs.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (
  this: unknown,
  request: string,
  ...args: unknown[]
) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

type N = Record<string, unknown>;
const NOW = Date.parse("2026-09-10T00:00:00Z");
const timer = (endsAt: unknown): N => ({ type: "countdown", endsAt, units: ["d", "h", "m", "s"] });

async function main(): Promise<void> {
  const { countdownProblems } = await import("@/lib/design/countdown");

  console.log("\na timer in the past is a row of zeros");
  check(
    countdownProblems(timer("2026-08-01T00:00:00Z"), NOW).length === 1,
    "last month is flagged",
  );
  check(
    countdownProblems(timer("2024-11-29T23:59:00Z"), NOW).length === 1,
    "a date from the model's training era is flagged",
  );
  check(
    /already|past|ended/i.test(countdownProblems(timer("2024-11-29T23:59:00Z"), NOW)[0] ?? ""),
    "the line says what is wrong",
    countdownProblems(timer("2024-11-29T23:59:00Z"), NOW)[0],
  );

  console.log("\nthe example date, after the example date passes");
  check(
    countdownProblems(timer("2026-11-24T23:59:00Z"), NOW).length === 0,
    "copied verbatim BEFORE Black Friday — still valid, left alone",
  );
  check(
    countdownProblems(timer("2026-11-24T23:59:00Z"), Date.parse("2026-12-01T00:00:00Z")).length === 1,
    "copied verbatim AFTER Black Friday — flagged",
  );

  console.log("\ntoo close to count");
  check(
    countdownProblems(timer("2026-09-10T00:04:00Z"), NOW).length === 1,
    "four minutes out is flagged — it ends while the page is being read",
  );
  check(
    countdownProblems(timer("2026-09-10T02:00:00Z"), NOW).length === 0,
    "two hours out is a real flash sale, left alone",
  );

  console.log("\na date that is not a date");
  check(countdownProblems(timer("next friday"), NOW).length === 1, "prose is flagged");
  check(countdownProblems(timer(""), NOW).length === 1, "empty is flagged");
  check(countdownProblems(timer(undefined), NOW).length === 1, "missing is flagged");

  console.log("\nquiet about everything else");
  check(countdownProblems(timer("2027-01-01T00:00:00Z"), NOW).length === 0, "next year is fine");
  check(countdownProblems({ type: "text", css: {} }, NOW).length === 0, "a text node is not judged");
  check(countdownProblems({ type: "row", children: [] }, NOW).length === 0, "a row is not judged");

  /* The other half of the fix. Flagging a dead timer only works if the model
     could have avoided writing one — which means being told what day it is.
     Both stages carry the line, in the user prompt, never the cached prefix. */
  console.log("\nthe model is told what day it is");
  const { todayLine } = await import("@/lib/design/countdown");
  const today = new Date().toISOString().slice(0, 10);
  check(todayLine().includes(today), "the line names today", todayLine());
  check(
    countdownProblems(timer(todayLine().match(/TODAY IS (\S+)/)?.[1] + "T00:00:00Z"), Date.now())
      .length === 1,
    "and today itself is already too late to count to",
  );

  const { __specPromptsForTest } = await import("@/lib/design/sectionSpec");
  const { system, user } = __specPromptsForTest({
    sell: "candles",
    storeType: "single product",
    styleLabel: "Warm",
    styleBlurb: "soft light",
    prompt: "black friday sale",
    order: null,
    market: null,
    tokens: { bg: "#ffffff", ink: "#111111", accent: "#cc3333", band: "#eeeeee" },
  } as never);
  check(user.includes(today), "stage 2's user prompt carries it");
  check(!system.includes(today), "and its system prefix does NOT — that prefix is the cache key");

  console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} failed.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
