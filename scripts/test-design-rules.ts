/* ==========================================================================
   TWO RULES THE DESIGN PROMPT CARRIES, AND WHAT THEY MAY NOT BECOME.

       npx tsx scripts/test-design-rules.ts

   Both are sentences in a prompt, which is the kind of thing that goes missing
   in an edit nobody reviews and fails in a way nothing reports: the build still
   runs, the page still arrives, and it is worse. So they are asserted.

   THE FACES. `pageStyle.type` carries sizes and weights and has never carried a
   family, so in html mockup mode the build model chose one with nothing said
   about it — and what a model reaches for unprompted is the list it has seen
   most, headed by faces a merchant may not ship. Gotham is licensed per site;
   Helvetica and Avenir come with an operating system, not with a web page.

   THE BRIEF. Most briefs are four words. Read as a full specification they
   produce a thin page — the model answered what it was asked rather than what
   was meant. The obvious fix is the dangerous one: this file has already
   shipped a rule that read the merchant's own words and then forbade four of
   the colours in them, by name, one line later. So the rule is written around
   SAID versus UNSAID, and the test below holds it there.

   No model is called and nothing is spent: this reads the prompt.
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

const { __specPromptsForTest } = require_(
  "../lib/design/sectionSpec",
) as typeof import("../lib/design/sectionSpec");

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}
const head = (s: string) => console.log(`\n${s}`);

const ask = {
  pageType: "home",
  order: null,
  sell: "candles",
  storeType: "d2c",
  market: null,
  styleLabel: "Minimal",
  styleBlurb: "quiet, generous space",
  prompt: "Sell candles, make it look premium",
  tokens: { bg: "#FFFFFF", ink: "#111111", accent: "#B08D57", band: "#F5F2ED" },
} as never;

const { system, user } = __specPromptsForTest(ask);
const all = `${system}\n${user}`;
/* Comments are not instruction. A rule that survives only in a comment is a
   rule the model never reads, and this test would otherwise pass on one. */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
/* AND WHITESPACE IS COLLAPSED. The prompt is an array of lines joined with
   newlines, so a sentence the reader sees whole sits in the string with a
   newline through the middle of it — "the rule is the licence, not the\nlist".
   Matching the raw string therefore fails on phrases that ARE present, which
   is how the first run of this file reported two rules missing that were
   sitting in front of it. */
const said = strip(all).replace(/\s+/g, " ");

head("the two faces are asked for, by licence rather than by name");
check(/fonts\.googleapis\.com/.test(said), "the only source it may load from is named");
check(/OFL/.test(said) && /Apache 2\.0/.test(said) && /UFL/.test(said), "all three licences are named");
check(
  /free commercial use/i.test(said),
  "and what the licences are FOR is said, not left to be inferred",
);
for (const face of ["Gotham", "Canela", "Futura", "Helvetica", "Avenir", "SF Pro"])
  check(said.includes(face), `${face} is named as ruled out`);
check(
  /rule is the licence, not the list/i.test(said),
  "AND THE LIST IS MARKED AS EXAMPLES — six names is not a policy, and a model that reads it as one ships the seventh",
);
check(
  /which family sets the headings and which/i.test(said),
  "both faces are asked for, not just one",
);
check(/fallback/i.test(said), "with a fallback stack, so the page reads before the webfont lands");

head("no approved family is named, which would be a house style");
for (const family of ["Inter", "Poppins", "Playfair", "Montserrat", "Lato", "Roboto"])
  check(
    !said.includes(family),
    `${family} is NOT named as an approved face`,
    "naming one makes it the answer for every store",
  );

head("a thin brief is permission, not a ceiling");
check(/WHAT THE BRIEF SAYS IS SETTLED/.test(said), "the line between said and unsaid is drawn");
check(
  /same quality/i.test(said) && /four-word/i.test(said),
  "a short brief is held to the same bar as a long one",
);
check(
  /never what is spoken|never traded up|NEVER TRADED UP/i.test(said),
  "AND WHAT THE BRIEF STATES IS NEVER OVERRIDDEN",
  "this is the half that keeps it from becoming the palette cage",
);
check(
  /colour it names is that colour/i.test(said),
  "named colours specifically, because that is the one this file got wrong before",
);
check(
  /contradicts is a defect/i.test(said),
  "and the rule carries a test with a wrong answer, not an adjective",
);

head("the merchant's own words still reach the model intact");
check(user.includes("Sell candles, make it look premium"), "verbatim, unsummarised");
check(
  !/rewrite the brief|improve the brief|replace the brief/i.test(said),
  "and nothing anywhere invites the model to rewrite them",
);

console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
