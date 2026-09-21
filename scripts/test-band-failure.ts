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

console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
if (bad > 0) process.exitCode = 1;
