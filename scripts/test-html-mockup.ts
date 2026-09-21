/* ==========================================================================
   HTML mockup mode: what reaches the model when no rule is allowed to.

       npx tsx scripts/test-html-mockup.ts

   The mode exists to answer one question the normal pipeline cannot: how good
   a page does DeepSeek build from Opus's description ALONE? So the property
   under test is a negative one — that nothing of ours is in the prompt — and a
   negative property nobody can run is a claim rather than a fact.

   Two things must hold, and neither is visible to the type checker:

   1. The system prompt carries NO skill text. Not the contract, not the node
      vocabulary, not the ban list, not a sliced pattern. Only the sentence that
      names the output format, which is not a design rule and cannot be dropped
      — without it the model does not know whether to answer in HTML or JSON.

   2. The user prompt is what it always was, minus its closing line. That half
      IS Opus's description, and the whole point is to hand it over unchanged.

   No key, no network, no bill: only the prompt assembly runs.
   ========================================================================== */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

process.env.PFD_DB_FILE = join(mkdtempSync(join(tmpdir(), "pfd-html-")), "store.json");

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const BASE = {
  sell: "wireless headphones",
  prompt: "Editorial and quiet.",
  storeType: "single-product",
  market: null,
  style: "editorial",
  styleLabel: "Editorial",
  styleBlurb: "Type-led, generous space",
  density: "normal",
  reference: null,
  refSections: null,
  refStyle: null,
  structure: null,
  order: null,
  verticalSlug: "audio",
  storeDomain: "test.myshopify.com",
  deckSize: 1,
  pageLabel: "Product",
  pageType: "product",
  tokens: {
    bg: "#FFFFFF", ink: "#111111", accent: "#FF6A1F", band: "#F5F5F3",
    border: "#E4E4E1", fontHeading: "Inter", fontBody: "Inter", radius: 8,
  },
};

/* Sentences that exist only in our skill files. If any of them is in the system
   prompt, a rule reached the model. */
const OURS = ["# Node vocabulary", "# The ban list", "What you return", "Design discipline"];

async function main(): Promise<void> {
  const { __designPromptsForTest, htmlMockupEnabled } = await import("../lib/ai/designServer");

  /* ---- ON IN THE SOURCE, IN EVERY ENVIRONMENT -------------------------

     It used to be `MOCKUP_HTML=1` in the environment, and the deployment is
     not the laptop: a flag nobody sets is a flag that is off, so production
     could be building a different kind of page from the one being worked on
     all day and nothing anywhere would say so. That has happened once already
     in this project — `DESIGN_PROVIDER` was an env var the deployment never
     set, and every Opus result came from a laptop while production quietly ran
     something cheaper.

     So the value is in the source and an operator cannot forget it. `=off` is
     the rollback, and it is the only way this is ever false. */
  console.log("the mode, pinned");
  delete process.env.MOCKUP_HTML;
  check(htmlMockupEnabled() === true, "on with nothing set, because the source says so");
  process.env.MOCKUP_HTML = "off";
  check(htmlMockupEnabled() === false, "and off only when explicitly rolled back");

  console.log("\nthe json path, which must not move");
  const json = await __designPromptsForTest(BASE as never);
  check(json.system.length > 10_000, "system carries the skills", `${json.system.length} chars`);
  check(json.user.trimEnd().endsWith("Return the JSON object now."), "and the user prompt asks for JSON");

  console.log("\nhtml mockup mode");
  process.env.MOCKUP_HTML = "1";
  check(htmlMockupEnabled() === true, "html mode reads the flag");
  const html = await __designPromptsForTest(BASE as never);

  check(html.system.length < 400, "the system prompt is one line, not a skill set", `${html.system.length} chars`);
  const leaked = OURS.filter((s) => html.system.includes(s));
  check(leaked.length === 0, "no skill text reaches the model", leaked.join(", ") || "none");
  check(/html/i.test(html.system), "it does name the output format");

  /* The user half is Opus's description and must arrive unchanged. Compared
     line by line, because the only legal difference is the last one. */
  const a = json.user.trimEnd().split("\n");
  const b = html.user.trimEnd().split("\n");
  const sameBody = a.slice(0, -1).join("\n") === b.slice(0, -1).join("\n");
  check(sameBody, "Opus's description is handed over byte for byte");
  check(!/JSON object/i.test(b.at(-1) ?? ""), "and the closing line no longer asks for JSON", b.at(-1) ?? "");

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
