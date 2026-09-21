/* ==========================================================================
   WHY A BAND WAS DROPPED, IN THE LINE THAT SAYS IT WAS.

       npx tsx scripts/test-band-failure.ts

   `1 failed: not a section: no usable sections` has been in the logs for
   weeks and says nothing. It is the message from the ONE refine in the schema
   that is still allowed to reject a document — reached because `list()` had
   already dropped the section silently, so by the time anything fails there is
   no longer a section to ask about.

   A merchant saw it as a product page with no buy box: ten bands in the
   mockup, nine in the file, and nothing anywhere naming the tenth.

   So the failure has to carry the first real issue and its path.
   ========================================================================== */
import { createRequire } from "node:module";
import Module from "node:module";

/* `htmlToTree` is server-only; the same shim every other suite here uses. */
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
};

import { whyNotASection } from "../lib/design/schema";

let bad = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad += 1;
}

const good = { type: "section", role: "hero", children: [{ type: "text", text: "hi" }] };

console.log("\nwhat the reason says");

check(whyNotASection(good) === null, "a section that parses has no reason", String(whyNotASection(good)));

/* The shape the model actually returns when it forgets the wrapper. */
const noType = { role: "hero", children: [{ type: "text", text: "hi" }] };
const r1 = whyNotASection(noType) ?? "";
check(r1.includes("type"), "a section missing its own `type` says so", r1);

/* ---- AND THE OTHER SILENCE, WHICH IS THE WORSE ONE --------------------

   A malformed CHILD is not a failure at all: `children: list(node, 32)` drops
   it and the section parses, so the band ships one element short and nothing
   anywhere says which. That is how a buy box disappears from a page that still
   reports every band built — no failure line to read, because there was no
   failure. The count is the only evidence, so the count has to be said. */
const lostChild = {
  type: "section",
  role: "buy box",
  children: [
    { type: "text", text: "kept" },
    { type: "nonsense", whatever: true },
  ],
};
const r2 = whyNotASection(lostChild) ?? "";
check(r2 !== "", "a section that lost a child to the parser says so", r2 || "(none)");
check(/1 of 2/.test(r2), "and says how many of how many", r2);

check(whyNotASection("an apology, not JSON") !== null, "a string is not a section", String(whyNotASection("x")));
check(whyNotASection(null) !== null, "and neither is nothing");

/* ---- AND WHEN THERE IS NO SECTION TO ASK ABOUT AT ALL ------------------

   The reason that came back from a real page was

     not a section: the section itself: Invalid input: expected object,
     received null

   which is Zod saying it was handed nothing. That happens before any of this:
   the model's answer held no JSON object the extractor could find. Saying
   "received null" a second time explains nothing — what is missing is what the
   model DID say, and nobody has ever seen it, because the answer is dropped on
   the floor the moment it fails to parse.

   A line of it is enough to tell an apology from a fenced block from a
   truncated brace, and those are three different bugs. */
async function saidWhat(): Promise<void> {
  /* Loaded here, not at the top: the shim above has to be in place before
     anything reaches `server-only`, and a static import is hoisted past it. */
  const { snippetOf } = await import("../lib/pagefly/htmlToTree");

  console.log("\nwhat the model said, when it said nothing usable");

  check(snippetOf("") === "(empty)", "an empty answer says so", snippetOf(""));
  check(snippetOf("   \n  ") === "(empty)", "and so does whitespace", snippetOf("   "));
  check(
  snippetOf("I'm sorry, I cannot\ntranscribe that band.") ===
    "I'm sorry, I cannot transcribe that band.",
  "an apology comes back on one line",
  snippetOf("I'm sorry, I cannot\ntranscribe that band."),
  );
  const long = snippetOf("x".repeat(400));
  check(long.length <= 140, "a long answer is cut to something a log can hold", String(long.length));
  check(long.endsWith("…"), "and says it was cut", long.slice(-12));

}

void saidWhat().then(() => {
  console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
  if (bad > 0) process.exitCode = 1;
});
