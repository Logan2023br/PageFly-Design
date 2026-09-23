/* ==========================================================================
   THE WORKED EXAMPLE FITS THE BOX IT IS AN EXAMPLE OF.

       npx tsx scripts/test-brief-example.ts

   `PROMPT_EXAMPLE` is shown by the Example button beside both prompt fields,
   with a Copy button under it and a "n / 3000 characters" line. The merchant it
   is written for does one thing with it: copies it, pastes it into the field,
   and edits it into their own brief.

   SO IT HAS TO FIT, and it now fits EXACTLY — 3,000 of 3,000, with no headroom
   at all. A comment asking the next person to check the number is not a check;
   one added clause makes the dialog offer a brief that the field beside it
   refuses, and the failure appears as a paste that silently loses its tail
   rather than as an error. `maxLength` on a textarea truncates in silence.

   THREE NUMBERS THAT HAVE TO AGREE, and this is where they are made to:

     MAX_PROMPT_CHARS         what the form accepts
     MAX_PROMPT_CHARS_STORED  what a SAVED run can be read back as
     PROMPT_EXAMPLE.length    what the dialog hands over

   The middle one is the ceiling the first may not pass: it decodes runs built
   under older limits, and `decodeRunPayload` fails QUIETLY — so a form that
   accepts more than the Library can read would write briefs whose pages simply
   stop appearing. That is the whole reason it is asserted here rather than
   trusted.
   ========================================================================== */
import {
  MAX_PROMPT_CHARS,
  MAX_PROMPT_CHARS_STORED,
  PROMPT_EXAMPLE,
} from "../lib/briefOptions";
import { briefSchema } from "../lib/validation";

let bad = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad += 1;
}

console.log("\nthe example fits the field it demonstrates");

check(
  PROMPT_EXAMPLE.length <= MAX_PROMPT_CHARS,
  "it can be pasted in whole",
  `${PROMPT_EXAMPLE.length} / ${MAX_PROMPT_CHARS}`,
);

/* Trimmed, because the API route validates `z.string().trim().max(...)` and the
   textarea does not — a trailing newline would pass one and be counted by the
   other, and the two would disagree about whether the same text fits. */
check(
  PROMPT_EXAMPLE === PROMPT_EXAMPLE.trim(),
  "no leading or trailing whitespace to disagree about",
);

check(
  MAX_PROMPT_CHARS <= MAX_PROMPT_CHARS_STORED,
  "the form cannot accept more than the Library can read back",
  `${MAX_PROMPT_CHARS} <= ${MAX_PROMPT_CHARS_STORED}`,
);

console.log("\nand a brief made of it is a valid brief");

/* THROUGH THE REAL SCHEMA, not a length comparison. The field has other rules —
   `.trim().min(1)` among them — and a ceiling check that passes while the
   schema refuses the same string would be a green test on a broken dialog. */
const parsed = briefSchema.safeParse({
  whatYouSell: "Halloween costumes, decor and candy",
  visualStyle: "dark",
  storeType: "d2c",
  prompt: PROMPT_EXAMPLE,
  pages: { home: 1 },
});

check(
  parsed.success,
  "the schema accepts it",
  parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 2)),
);

console.log("\nit is still a worked example, not a sentence");

/* The example exists to show the SHAPE of a brief: what is sold, then the look,
   then the rules, then a line per page. These are the load-bearing parts — an
   example that has lost them is a paragraph about a shop. */
for (const [what, needle] of [
  ["it names the pages wanted", /pages:/i],
  ["it states a palette", /#[0-9a-f]{6}/i],
  ["it names the fonts", /fonts/i],
  ["it gives a line per page", /home[:\s(]/i],
] as const) {
  check(needle.test(PROMPT_EXAMPLE), what);
}

console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
if (bad > 0) process.exitCode = 1;
