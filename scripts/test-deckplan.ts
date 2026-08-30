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

  console.log("\nthe openings");

  /* A hero was coming back as a photograph with a headline over it every time,
     on every store. Three of the nine now exist for the stores that have
     something better: footage, more than one thing to lead with, or photography
     too uneven to read type through. */
  const { patternsByRole, roleFor } = await import("@/lib/design/plan");
  const heroes = patternsByRole().get("hero") ?? [];
  check(heroes.length === 9, "nine openings to choose between", String(heroes.length));
  for (const id of ["hero-video-bleed", "hero-slideshow", "hero-split-media"])
    check(heroes.includes(id) && roleFor(id) === "hero", `${id} is a hero`);

  const { __promptsForTest: heroPrompts } = await import("@/lib/design/deckPlan");
  const sys = heroPrompts({
    sell: "Fashion & apparel", storeType: "d2c", vertical: "fashion-apparel",
    market: null, pageTypes: ["home"], prompt: "", styleLabel: "Bold",
    styleBlurb: "", density: "normal",
    tokens: { bg: "#fff", ink: "#111", accent: "#f00", band: "#eee" },
    refSections: null, refStyle: null,
  } as never).system;
  check(sys.includes("hero-video-bleed"), "and the deck plan is told they exist");
  check(sys.includes("not interchangeable"), "and told they are not the same choice");

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

  /* ---- how long a page may be -------------------------------------------- */

  /* THE BUG THIS BRANCH SHIPPED WITH. struct-v2 carried its own flat 3-to-12
     bound while `sectionPlan.ts` already held a per-page-type table, and the
     first real build gave `home` ten sections — two product grids, a stat
     strip, spec bars, an ingredient list, a proof wall. The page call spent all
     48,000 of its output tokens thinking and returned no JSON at all. Two files
     holding two different numbers, which is the failure this repo keeps
     meeting. */

  console.log("\nhow long a page may be");

  {
    const { sectionBounds } = await import("../lib/design/sectionPlan");
    const home = sectionBounds("home");
    check(home.cap === 9, "home's cap comes from the table", `${home.cap}`);

    /* Twelve real, distinct ids — more than home may have. */
    const many = [
      "hero-full-bleed-scrim", "stat-strip-3up", "ingredient-list",
      "collection-featured-row", "collection-grid-3up", "spec-bars",
      "origin-band", "social-proof-wall", "guarantee-row", "faq-accordion",
      "usecase-tiles-overlay", "cta-band-full",
    ].map((pattern) => ({ pattern }));

    const notes: string[] = [];
    const out = __vetForTest("home", many, never, notes);

    check(
      (out?.length ?? 0) <= home.cap,
      "a home page of twelve bands is cut to the cap",
      `${out?.length}`,
    );
    check(notes.some((n) => n.includes("cut to")), "and the cut is recorded");
  }

  {
    /* A collection page is shorter than a home page, and the vet must know it
       rather than applying one number to every page type. */
    const { sectionBounds } = await import("../lib/design/sectionPlan");
    const collection = sectionBounds("collection");
    check(collection.cap === 7, "collection's cap is its own", `${collection.cap}`);

    const many = [
      "hero-full-bleed-scrim", "stat-strip-3up", "ingredient-list",
      "collection-featured-row", "collection-grid-3up", "spec-bars",
      "origin-band", "social-proof-wall", "guarantee-row",
    ].map((pattern) => ({ pattern }));

    const out = __vetForTest("collection", many, never, []);
    check(
      (out?.length ?? 0) <= collection.cap,
      "and a nine-band collection page is cut to it",
      `${out?.length}`,
    );
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

  console.log("\nthe closing form is the designer's call");

  {
    const { isAdvisoryPin, pinnedFor } = await import("@/lib/design/plan");

    check(isAdvisoryPin("lead-form-split"), "the enquiry form is advisory");
    check(isAdvisoryPin("newsletter-inline"), "so is the newsletter");
    for (const p of ["product-detail-gallery", "collection-grid-3up", "collection-featured-row"])
      check(!isAdvisoryPin(p), `${p} is not — a page without it is broken, not different`);

    /* Still in the table: the deterministic planner fills its conversion slot
       from it, and a Contact page built without a model must still take the
       enquiry. What changed is who may decline it. */
    check(pinnedFor("contact").includes("lead-form-split"), "contact still pins the form");
    check(pinnedFor("size-guide").includes("newsletter-inline"), "size-guide still pins the letter");

    /* A page whose designer ended it on something else keeps that ending. This
       is the whole fix: sixteen page types pin one of these two, so the repair
       was bolting the same form to the foot of nearly every page in a deck. */
    const { out, notes } = run(
      [
        { pattern: HERO },
        { pattern: MEDIA },
        { pattern: PROOF },
        { pattern: CLOSE },
      ],
      "contact",
    );
    check(
      out?.every((b) => b.pattern !== "lead-form-split") === true,
      "a contact page with no form keeps no form",
      out?.map((b) => b.pattern).join(","),
    );
    check(
      !notes.some((n) => n.includes("lead-form-split")),
      "and nothing is recorded, because nothing was done",
    );

    /* The buy box is the other half and it did NOT change. */
    const shop = run([{ pattern: HERO }, { pattern: MEDIA }, { pattern: CLOSE }], "product");
    check(
      shop.out?.some((b) => b.pattern === "product-detail-gallery") === true,
      "a product page with no buy box still gets one",
      shop.out?.map((b) => b.pattern).join(","),
    );

    /* The prompt has to say the same thing the code does. A model told
       something is REQUIRED and then shown it is not learns the wrong thing
       about every other line in the prompt. */
    const both = heroPrompts({
      sell: "Fashion & apparel", storeType: "d2c", vertical: "fashion-apparel",
      market: null, pageTypes: ["product", "contact"], prompt: "", styleLabel: "Bold",
      styleBlurb: "", density: "normal",
      tokens: { bg: "#fff", ink: "#111", accent: "#f00", band: "#eee" },
      refSections: null, refStyle: null,
    } as never);
    /* The page list is in the USER prompt — the system half is the vocabulary
       and the rules, which are the same for every build and are cached. */
    check(
      both.user.includes("product — MUST include product-detail-gallery"),
      "the buy box is still stated as a requirement",
    );
    check(
      both.user.includes("contact — usually ends on lead-form-split"),
      "and the form as a habit, not a requirement",
    );
    check(
      both.user.includes("built without one"),
      "with the consequence spelled out: leave it out and it stays out",
    );
    check(
      !both.system.includes("an enquiry ends with the form. These are not matters of taste"),
      "and rule 1 no longer claims an enforcement that was removed",
    );
  }

  console.log("\nwhat each page type is for");

  {
    const prompt = (pageTypes: string[]) =>
      heroPrompts({
        sell: "Fashion & apparel", storeType: "d2c", vertical: "fashion-apparel",
        market: null, pageTypes, prompt: "", styleLabel: "Bold",
        styleBlurb: "", density: "normal",
        tokens: { bg: "#fff", ink: "#111", accent: "#f00", band: "#eee" },
        refSections: null, refStyle: null,
      } as never).system;

    const five = prompt(["home", "about", "contact", "size-guide", "faq"]);
    check(five.includes("4. WHAT EACH PAGE TYPE IS FOR"), "the rule is in the prompt");
    for (const [type, words] of [
      ["about", "why the brand exists"],
      ["contact", "a map if you need one"],
      ["size-guide", "cut returns"],
      ["faq", "block a sale"],
    ] as const)
      check(five.includes(`${type} — `) && five.includes(words), `${type} is described`, words);

    /* The description is the merchant's, not a second copy written in the
       prompt — one sentence per page, in one place. */
    const { PAGE_BY_ID } = await import("@/lib/pageCatalog");
    check(
      five.includes(`about — ${PAGE_BY_ID.about.blurb}`),
      "and it is the sentence from the page picker, verbatim",
    );

    /* Only what was asked for: a rule listing pages nobody ordered is a rule
       the model has to work out which lines apply to. */
    check(!five.includes("cart — "), "a page type not in the deck is not listed");

    check(
      five.includes("swap their section lists"),
      "two pages that could swap section lists are called out",
    );

    /* Renumbered when this went in, and a hole in the numbering is exactly
       what the first version of it produced. */
    const numbers = (s: string) => [...s.matchAll(/^(\d)\. /gm)].map((m) => Number(m[1])).join(",");
    check(numbers(five) === "1,2,3,4,5,6,7,8", "the rules are numbered 1 to 8, once each", numbers(five));

    /* A type the catalogue does not know contributes no LINE. It does not
       take the rule with it — the principle holds for a page nobody has
       described, and a missing 4 says a rule was cut without saying which. */
    const unknown = prompt(["lp-workshop-2026"]);
    check(unknown.includes("4. WHAT EACH PAGE TYPE IS FOR"), "an unknown type keeps the rule");
    /* Sliced to rule 4 — rules 2 and 3 name every page type by design, so the
       whole prompt is the wrong haystack for "was it described". */
    const rule4 = unknown.slice(
      unknown.indexOf("4. WHAT EACH PAGE TYPE"),
      unknown.indexOf("5. Do not use a buy-box"),
    );
    check(!rule4.includes("lp-workshop-2026"), "and gets no invented description");
    check(!unknown.includes("they came for:"), "the list's lead-in goes with the list");
    check(numbers(unknown) === "1,2,3,4,5,6,7,8", "the numbering has no hole in it", numbers(unknown));
  }

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
