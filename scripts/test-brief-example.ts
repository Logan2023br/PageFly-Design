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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_PROMPT_CHARS,
  MAX_PROMPT_CHARS_STORED,
  PROMPT_EXAMPLES,
} from "../lib/briefOptions";
import { briefSchema } from "../lib/validation";

let bad = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad += 1;
}

console.log("\nevery example fits the field it demonstrates");

check(PROMPT_EXAMPLES.length >= 2, "there is more than one to choose from", String(PROMPT_EXAMPLES.length));
check(
  new Set(PROMPT_EXAMPLES.map((e) => e.id)).size === PROMPT_EXAMPLES.length,
  "no two share an id — they are counted apart in analytics",
);
check(
  new Set(PROMPT_EXAMPLES.map((e) => e.label)).size === PROMPT_EXAMPLES.length,
  "and no two share a label, which would make the buttons unreadable",
);

check(
  MAX_PROMPT_CHARS <= MAX_PROMPT_CHARS_STORED,
  "the form cannot accept more than the Library can read back",
  `${MAX_PROMPT_CHARS} <= ${MAX_PROMPT_CHARS_STORED}`,
);

for (const example of PROMPT_EXAMPLES) {
  console.log(`\n  ${example.label} (${example.id})`);

  check(
    example.text.length <= MAX_PROMPT_CHARS,
    "    can be pasted in whole",
    `${example.text.length} / ${MAX_PROMPT_CHARS}`,
  );

  /* Trimmed, because the API route validates `z.string().trim().max(...)` and
     the textarea does not — a trailing newline would pass one and be counted by
     the other, and the two would disagree about whether the same text fits. */
  check(
    example.text === example.text.trim(),
    "    no leading or trailing whitespace to disagree about",
  );

  check(example.blurb.length > 0, "    has a blurb saying what kind of store it is");

  /* THROUGH THE REAL SCHEMA, not a length comparison. The field has other rules
     and a ceiling check that passes while the schema refuses the same string
     would be a green test on a broken dialog. */
  const parsed = briefSchema.safeParse({
    whatYouSell: "Halloween costumes, decor and candy",
    visualStyle: "dark",
    storeType: "d2c",
    prompt: example.text,
    pages: { home: 1 },
  });
  check(
    parsed.success,
    "    the schema accepts it",
    parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 2)),
  );

  /* The example exists to show the SHAPE of a brief: what is sold, then the
     look, then the rules, then a line per page. These are the load-bearing
     parts — an example that has lost them is a paragraph about a shop. */
  for (const [what, needle] of [
    ["    names the pages wanted", /pages:/i],
    ["    states a palette", /#[0-9a-f]{6}/i],
    ["    names the fonts or the type", /font|serif|headings/i],
    ["    gives a line per page", /home[:\s(]/i],
  ] as const) {
    check(needle.test(example.text), what);
  }
}

console.log("\nthe analytics screen can name each one");

/* ==========================================================================
   THE PRESS CARRIES `which`, AND A CHART HAS TO BE ABLE TO READ IT.

   Adding an example is two edits in two files, and the second is the one that
   gets forgotten: the tile splits on `which`, and an id with no label renders
   as the id. `test-analytics-coverage.ts` catches that for the CTA locations
   and the install surfaces; this is the same check for the same reason, kept
   here because this is the file somebody edits when they add an example.
   ========================================================================== */
{
  const route = readFileSync(
    join(import.meta.dirname, "..", "app/api/admin/analytics/route.ts"),
    "utf8",
  );
  const at = route.indexOf("const PROMPT_EXAMPLE_LABELS");
  const body = at === -1 ? "" : route.slice(at, route.indexOf("\n};", at));

  check(at !== -1, "PROMPT_EXAMPLE_LABELS exists in the analytics route");
  for (const example of PROMPT_EXAMPLES) {
    check(
      new RegExp(`^\\s*${example.id}:\\s*"`, "m").test(body),
      `"${example.id}" is labelled for the chart`,
    );
  }
}

console.log("\nthe two are genuinely different briefs");

/* Two examples that demonstrate the same taste are one example with extra
   reading. The point of the second is that a merchant whose shop is nothing
   like the first has somewhere to start. */
const [a, b] = PROMPT_EXAMPLES;
const words = (t: string) => new Set(t.toLowerCase().match(/[a-z]{4,}/g) ?? []);
const shared = [...words(a.text)].filter((w) => words(b.text).has(w)).length;
const overlap = shared / Math.min(words(a.text).size, words(b.text).size);
check(overlap < 0.5, "less than half their vocabulary overlaps", `${Math.round(overlap * 100)}%`);

console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
if (bad > 0) process.exitCode = 1;
