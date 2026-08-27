/* ==========================================================================
   Which unusable answers are worth asking for again?

       npx tsx scripts/test-answer-shape.ts

   `designPageTree` retries a page exactly once when the model's answer is no
   use. Which answers qualify is the whole decision, and it is a money decision:
   a working page costs 45,000-50,000 output tokens, so retrying the wrong class
   of failure doubles the bill and changes nothing.

   The rule started as "retry only an empty answer", from a measurement on
   struct-v2: the same page, the same prompt, six runs, three working trees and
   three EMPTY strings after seven to nine thousand thinking tokens. Not
   truncated — the model reasoned and then said nothing.

   Then a real build failed with this, which is not empty:

     model did not return JSON — 23719 output tokens, answer began:
     "{\"plan\":\"hero · hero-full-bleed-scrim · 88vh knit street shot, …"

   That answer began EXACTLY right. `{"plan":…` is the first thing
   `skills/00-contract.md` asks for. It is the same failure as the empty one —
   a stream that stopped being JSON partway — wearing a different symptom, and
   the merchant got no page for it.

   So the rule is now about the SHAPE of what came back, and this pins down all
   four shapes: nothing, a broken JSON stream, prose, and a real answer.
   ========================================================================== */

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { worthAskingAgain, parseObject } = await import("../lib/ai/json");

  /* The real one, from the build that failed. Truncated to the same 120
     characters the error message reported, which is what makes it unparseable. */
  const CUT_OFF =
    '{"plan":"hero · hero-full-bleed-scrim · 88vh knit street shot, bottom-left promise, one brass CTA, shipping/returns note';

  const GOOD = '{"plan":"hero · one band","sections":[{"type":"section","role":"hero"}]}';

  console.log("\nan answer that is not there");

  check(worthAskingAgain("", false), "nothing at all is worth asking again");
  check(worthAskingAgain("   \n\t ", false), "and so is whitespace");

  console.log("\nan answer that began as JSON and stopped");

  check(
    parseObject(CUT_OFF) === null,
    "the real failing answer does not parse",
    "which is why it reached this decision at all",
  );
  check(
    worthAskingAgain(CUT_OFF, false),
    "a JSON stream that stopped mid-object is worth asking again",
    "same class as empty: no artefact, just a broken stream",
  );
  check(
    worthAskingAgain('```json\n{"plan":"hero · one band","sections":[{"type":"sec', false),
    "and so is a fenced one that stopped",
  );

  console.log("\nan answer that is prose");

  /* The original reasoning, kept: prose is a diagnosable artefact. Asking again
     buries the evidence and most likely buys more prose. */
  for (const prose of [
    "I cannot design this page without more information about the brand.",
    "Sure! Here is the page you asked for:",
    "Let me think about this step by step. First, the hero...",
  ]) {
    check(
      !worthAskingAgain(prose, false),
      "prose is reported, not retried",
      JSON.stringify(prose.slice(0, 34)),
    );
  }

  console.log("\nan answer that is fine");

  check(parseObject(GOOD) !== null, "a good answer parses");
  check(!worthAskingAgain(GOOD, false), "and is never retried");
  check(
    !worthAskingAgain('  \n{"plan":"x","sections":[]}\n ', false),
    "padding does not change that",
  );

  console.log("\nand truncation is a different problem");

  /* The ceiling, not the model. A second ask at the same ceiling stops at the
     same place, so it is one page's tokens spent to reproduce a known failure. */
  check(!worthAskingAgain(CUT_OFF, true), "a truncated JSON stream is NOT retried");
  check(!worthAskingAgain("", true), "nor a truncated empty answer");
  check(
    worthAskingAgain(CUT_OFF, false) && !worthAskingAgain(CUT_OFF, true),
    "the same text decides differently on the truncation flag alone",
    "which is the only reason `truncated` is a parameter",
  );

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

/* A module, not a script. Without this TypeScript puts `failures` and `check`
   in the global scope, where every other import-less test script in this folder
   declares the same two names. */
export {};
