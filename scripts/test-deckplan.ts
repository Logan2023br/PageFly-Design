/* ==========================================================================
   Can a bad deck plan still cost a page?

       npx tsx scripts/test-deckplan.ts

   `deckPlan.ts` hands the model four decisions `finish()` used to make in code:
   which band is the signature, which invert, how much room each gets, which may
   carry a photograph. A model asked those questions gets them wrong in ways
   code never could — two signatures, six backgrounds, every band the same
   padding, two dark bands touching.

   So `vet` repairs them, and this is the proof that it does. No model is
   called: every case here is a hand-written answer of the kind the model
   actually produces, fed straight to the vetting.

   THE POINT IS NOT THAT THE REPAIRS EXIST. It is that they are COUNTED. Each
   repair appends a line to `repairs`, and that count is the number the whole
   experiment turns on — a model that needs the rhythm fixed on most pages was
   not ready to own the rhythm, and the count says so before anyone's taste has
   to. A repair that fired silently would be a repair nobody could measure.
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

type Band = {
  pattern: string;
  signature?: boolean;
  dark?: boolean;
  padding?: string;
  bg?: boolean;
  motion?: string | null;
  brief?: string;
};

async function main(): Promise<void> {
  const { __vetForTest } = await import("../lib/design/deckPlan");

  /* Real ids, so `roleFor` resolves and the band is not dropped as invented.
     Taken from `20-patterns.md` — a test built on made-up ids would pass by
     dropping everything, which is the opposite of what is being checked. */
  const HERO = "hero-full-bleed-scrim";
  const MEDIA = "usecase-tiles-overlay";
  /* `comparison-table`, not `social-proof-wall` — the name suggests proof but
     `roleFor` puts that one in `conversion`, and this constant is used to test
     that a photograph is refused behind a PROOF band. Named by what the
     resolver says, not by what the id reads like. */
  const PROOF = "comparison-table";
  const CONTENT = "story-band";
  const CLOSE = "cta-band-full";

  const never = () => false;

  const run = (bands: Band[], pageType = "about") => {
    const notes: string[] = [];
    const out = __vetForTest(pageType, bands, never, notes);
    return { out, notes };
  };

  /* ---- the signature ---------------------------------------------------- */

  console.log("exactly one signature, never the hero");

  {
    const { out, notes } = run([
      { pattern: HERO, signature: true },
      { pattern: MEDIA, signature: true },
      { pattern: PROOF },
      { pattern: CLOSE, signature: true },
    ]);
    const marked = out?.filter((b) => b.signature).length ?? -1;
    check(marked === 1, "three signatures collapse to one", `${marked}`);
    check(
      out?.[0].signature === false,
      "and it is not the hero",
      out?.[0].signature ? "hero kept it" : "",
    );
    check(notes.length > 0, "the repair is recorded, not silent");
  }

  {
    const { out, notes } = run([
      { pattern: HERO },
      { pattern: MEDIA },
      { pattern: PROOF },
      { pattern: CLOSE },
    ]);
    check(
      out?.filter((b) => b.signature).length === 1,
      "a page with no signature at all gets one",
    );
    check(
      notes.some((n) => n.includes("no usable signature")),
      "and says so",
    );
  }

  {
    /* The hero is the ONLY band marked. Legal-marked is empty, so the fallback
       has to fire rather than the hero being kept by default. */
    const { out } = run([
      { pattern: HERO, signature: true },
      { pattern: MEDIA },
      { pattern: PROOF },
      { pattern: CLOSE },
    ]);
    check(out?.[0].signature === false, "a hero-only signature is moved off the hero");
    check(out?.filter((b) => b.signature).length === 1, "and exactly one band still has it");
  }

  /* ---- dark bands -------------------------------------------------------- */

  console.log("\ndark bands");

  {
    const { out, notes } = run([
      { pattern: HERO },
      { pattern: MEDIA, dark: true },
      { pattern: PROOF, dark: true },
      { pattern: CONTENT, dark: true },
      { pattern: CLOSE },
    ]);
    const dark = out?.map((b) => b.dark) ?? [];
    const adjacent = dark.some((d, i) => i > 0 && d && dark[i - 1]);
    check(!adjacent, "three touching dark bands are separated", dark.join(","));
    check(notes.some((n) => n.includes("both dark")), "and each separation is recorded");
  }

  {
    const { out, notes } = run([
      { pattern: HERO },
      { pattern: MEDIA },
      { pattern: PROOF },
      { pattern: CLOSE },
    ]);
    check(out?.some((b) => b.dark) === true, "a four-band page with no dark band gets one");
    check(
      out?.[out.length - 1].dark === true,
      "and it is the closing band",
    );
    check(notes.some((n) => n.includes("no dark band")), "recorded");
  }

  {
    /* Short pages are left alone: dark would be most of the page. */
    const { out } = run([{ pattern: HERO }, { pattern: MEDIA }, { pattern: CLOSE }]);
    check(
      out?.some((b) => b.dark) === false,
      "a three-band page is not forced to have one",
    );
  }

  /* ---- padding ----------------------------------------------------------- */

  console.log("\npadding");

  {
    const { out, notes } = run([
      { pattern: HERO, padding: "standard" },
      { pattern: MEDIA, padding: "standard", signature: true },
      { pattern: PROOF, padding: "standard" },
      { pattern: CONTENT, padding: "standard" },
      { pattern: CLOSE, padding: "standard" },
    ]);
    const distinct = new Set(out?.map((b) => b.padding)).size;
    check(distinct >= 3, "one padding value down the page is forced to three", `${distinct}`);
    check(
      out?.find((b) => b.signature)?.padding === "statement",
      "and the signature keeps the largest",
    );
    check(notes.some((n) => n.includes("three paddings")), "recorded");
  }

  {
    const { out, notes } = run([
      { pattern: HERO, padding: "standard" },
      { pattern: MEDIA, padding: "dense", signature: true },
      { pattern: PROOF, padding: "utility" },
      { pattern: CLOSE, padding: "standard" },
    ]);
    check(
      out?.find((b) => b.signature)?.padding === "statement",
      "a signature that asked for dense is promoted to statement",
    );
    check(notes.some((n) => n.includes("not statement padding")), "recorded");
  }

  {
    const { out } = run([
      { pattern: HERO, padding: "nonsense" as string },
      { pattern: MEDIA },
      { pattern: PROOF },
      { pattern: CLOSE },
    ]);
    const legal = ["statement", "standard", "dense", "utility"];
    check(
      out?.every((b) => legal.includes(b.padding)) === true,
      "an invented padding value never reaches the page",
    );
  }

  /* ---- backgrounds ------------------------------------------------------- */

  console.log("\nphotographs behind bands");

  {
    const { out, notes } = run([
      { pattern: HERO, bg: true },
      { pattern: MEDIA, bg: true },
      { pattern: CONTENT, bg: true },
      { pattern: PROOF, bg: true },
      { pattern: CLOSE, bg: true },
    ]);
    const withBg = out?.filter((b) => b.mayHaveBg).length ?? -1;
    check(withBg <= 2, "five bands wanting a photograph are cut to two", `${withBg}`);
    check(notes.some((n) => n.includes("wanted a photograph")), "recorded");
  }

  {
    const { out, notes } = run([
      { pattern: HERO },
      { pattern: PROOF, bg: true },
      { pattern: CONTENT },
      { pattern: CLOSE },
    ]);
    check(
      out?.find((b) => b.pattern === PROOF)?.mayHaveBg === false,
      "a photograph behind a proof band is refused — it carries detail",
    );
    check(notes.some((n) => n.includes("carries detail")), "recorded");
  }

  /* ---- the things that were already true -------------------------------- */

  console.log("\nwhat was already refused, still refused");

  {
    const { out, notes } = run([
      { pattern: HERO },
      { pattern: "not-a-real-pattern-id" },
      { pattern: MEDIA },
      { pattern: CLOSE },
    ]);
    check(
      out?.some((b) => b.pattern === "not-a-real-pattern-id") === false,
      "an invented pattern id is dropped",
    );
    check(notes.some((n) => n.includes("not a pattern id")), "recorded");
  }

  {
    const { out } = run([
      { pattern: HERO },
      { pattern: MEDIA },
      { pattern: MEDIA },
      { pattern: CLOSE },
    ]);
    check(
      out?.filter((b) => b.pattern === MEDIA).length === 1,
      "the same pattern twice becomes once",
    );
  }

  {
    const { out } = run([{ pattern: HERO }, { pattern: CLOSE }]);
    check(out === null, "a two-band page is refused outright — that is not a page");
  }

  {
    const banned = (id: string) => id === MEDIA;
    const notes: string[] = [];
    const out = __vetForTest(
      "about",
      [{ pattern: HERO }, { pattern: MEDIA }, { pattern: PROOF }, { pattern: CLOSE }],
      banned,
      notes,
    );
    check(
      out?.some((b) => b.pattern === MEDIA) === false,
      "a pattern this trade bans is dropped",
    );
    check(notes.some((n) => n.includes("bans it")), "recorded");
  }

  /* ---- the brief --------------------------------------------------------- */

  console.log("\nthe band brief");

  {
    const { out } = run([
      { pattern: HERO, brief: "The founder's line, over a workshop shot." },
      { pattern: MEDIA },
      { pattern: PROOF },
      { pattern: CLOSE },
    ]);
    check(
      out?.[0].brief === "The founder's line, over a workshop shot.",
      "a brief survives vetting",
    );
    check(out?.[1].brief === null, "and a band without one carries null, not undefined");
  }

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
