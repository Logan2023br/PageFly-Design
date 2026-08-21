/* ==========================================================================
   Regenerate `lib/pagefly/elements.ts` from the element reference.

       npx tsx scripts/gen-elements.ts

   Run it when `MD Json PageFly/fields.md` is updated. It rewrites only the
   PAGEFLY_ELEMENTS array and leaves everything else in the file alone, so the
   comments and the curated short list survive.

   It exists because the alternative is a hand-kept copy of ninety-five names,
   and a hand-kept copy goes stale silently: the dropdown simply stops offering
   the element an operator is looking at, and nobody finds out from a test.
   ========================================================================== */

import { readFileSync, writeFileSync } from "node:fs";

const FIELDS = "MD Json PageFly/fields.md";
const TARGET = "lib/pagefly/elements.ts";

const names = readFileSync(FIELDS, "utf8")
  .split("\n")
  .filter((l) => l.startsWith("## "))
  .map((l) => l.slice(3).trim())
  /* The file opens with a prose section that is not an element. */
  .filter((n) => n !== "Read this first")
  .sort((a, b) => a.localeCompare(b));

if (names.length < 50) {
  console.error(`Only ${names.length} elements found — is ${FIELDS} intact?`);
  process.exitCode = 1;
} else {
  const source = readFileSync(TARGET, "utf8");
  const block = `export const PAGEFLY_ELEMENTS = [\n${names
    .map((n) => `  ${JSON.stringify(n)},`)
    .join("\n")}\n] as const;`;

  const next = source.replace(
    /export const PAGEFLY_ELEMENTS = \[[\s\S]*?\] as const;/,
    block,
  );
  if (next === source) {
    console.log(`No change — ${names.length} elements, already in step.`);
  } else {
    writeFileSync(TARGET, next);
    console.log(`Wrote ${names.length} elements to ${TARGET}.`);
  }
}
