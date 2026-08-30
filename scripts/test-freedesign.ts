/* ==========================================================================
   Free design — the page decided by the model, not by a table.

       npx tsx scripts/test-freedesign.ts

   FREE_DESIGN=true skips stage 1 entirely: no pattern vocabulary, no ARCS, no
   PINNED, no trade block, no ban list. What is left between the model's answer
   and the renderer is this file's checking, and it is deliberately thin — it
   refuses only what something downstream switches on, and keeps everything
   else the answer said.

   No model is called. Every case is a hand-written answer of the shape the
   model actually returns.
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

async function main(): Promise<void> {
  const { __vetFreeSectionForTest: vet, __specPromptsForTest, freeDesignEnabled } =
    await import("../lib/design/sectionSpec");

  console.log("\nthe switch");

  {
    /* A constant, not an environment variable. The point is that the running
       server cannot be doing something the source does not say — so this
       asserts the two agree, and that no env var can talk either of them out
       of it. */
    const { FREE_DESIGN } = await import("../lib/design/sectionSpec");
    check(typeof FREE_DESIGN === "boolean", "it is a constant in the source", String(FREE_DESIGN));
    check(freeDesignEnabled() === FREE_DESIGN, "and the reader returns exactly it");

    const before = process.env.FREE_DESIGN;
    try {
      process.env.FREE_DESIGN = FREE_DESIGN ? "false" : "true";
      check(freeDesignEnabled() === FREE_DESIGN, "an env var of the same name changes nothing");
    } finally {
      if (before === undefined) delete process.env.FREE_DESIGN;
      else process.env.FREE_DESIGN = before;
    }
  }

  /* Every case below builds its own ask with `order: null`, which is what free
     mode IS — the constant decides whether the RUNNER takes this path, not
     whether the path behaves this way. So these hold either way it is set. */
  console.log("\nwhat the prompt no longer carries");

  const free = __specPromptsForTest({
    pageType: "about", order: null, sell: "Knitwear", storeType: "d2c", market: "us",
    styleLabel: "Editorial", styleBlurb: "", prompt: "A workshop in Portland.",
    tokens: { bg: "#FFFBF5", ink: "#12100E", accent: "#B4552C", band: "#F2ECE2" },
  } as never);

  check(!free.system.includes("ban spec-grid"), "no trade ban list");
  check(!free.system.includes("arch C"), "no trade block naming a hero and a signature");
  check(!free.system.includes("**hero-split-media**"), "no pattern skeletons");
  check(!free.user.includes("hero-"), "and no pattern named in the page brief");
  check(free.system.includes("There is no pattern library here"), "it is told so, not left to infer");

  /* The market is an answer the merchant gave in the brief, not a lesson. It
     travels as a fact beside the others; the twenty-line block does not. */
  check(!free.system.includes("THE MARKET THIS SELLS INTO"), "no market instruction block");
  check(!free.system.includes("buy-now-pay-later"), "and no hand-written market block");
  check(
    free.user.includes("SELLING INTO. United States"),
    "the market travels as a fact, in the line the merchant's other answers are on",
  );

  /* WHAT STAYS is the export's limits and nothing else — the elements a page
     can carry, the CSS it can carry, and the shape of the answer. */
  check(free.system.includes("SEVEN ARE REFUSED"), "the export's CSS limits stay");
  check(free.system.includes("THE ELEMENTS"), "and the element vocabulary");
  check(free.system.includes("ANSWER SHAPE"), "and the shape the answer arrives in");

  console.log("\nthe standard the page is held to");

  {
    /* One paragraph, one place, every call that designs anything. A standard
       that reads differently in two prompts is two standards. */
    const { THE_STANDARD } = await import("../lib/design/standard");
    const text = THE_STANDARD.join("\n");
    const { __promptsForTest: deckPrompts } = await import("../lib/design/deckPlan");
    const deck = deckPrompts({
      sell: "Bomber", storeType: "d2c", vertical: "fashion-apparel", market: null,
      pageTypes: ["home"], prompt: "", styleLabel: "Bold", styleBlurb: "",
      density: "normal", tokens: { bg: "#fff", ink: "#111", accent: "#f00", band: "#eee" },
      refSections: null, refStyle: null,
    } as never).system;

    check(free.system.includes(text), "free mode is held to it");
    check(deck.includes(text), "so is the call that chooses bands");
    check(text.length > 0 && free.system.split(text).length === 2, "and it is sent once, not twice");

    /* The half that does work. Adjectives a model already believes it is
       meeting rule nothing out; a question with a wrong answer does. */
    /* Line-wrapped prose, so match with the wrapping collapsed — an assertion
       that depends on where a line breaks is an assertion about column width. */
    const flat = text.replace(/\s+/g, " ");
    check(flat.includes("still remember about it an hour later"), "it carries a test, not only a compliment");
    check(flat.includes("nobody will look twice"), "and names the failure it stands against");
  }

  console.log("\nthe design opinions, gone from free and kept for banded");

  const banded = __specPromptsForTest({
    pageType: "product", sell: "Bomber", storeType: "single-product", market: "us",
    styleLabel: "Bold", styleBlurb: "", prompt: "",
    tokens: { bg: "#0F0F10", ink: "#F5F3EF", accent: "#D9482B", band: "#1A1A1C" },
    order: {
      vertical: "fashion-apparel", archetype: "C",
      patternIds: ["product-detail-gallery"], motionIds: [],
      sections: [{ role: "commerce", pattern: "product-detail-gallery", signature: true,
        dark: false, padding: "standard", motion: null, mayHaveBg: false, brief: null }],
    },
  } as never);

  for (const [what, needle] of [
    ["the buy-box list", "THE BUY BOX."],
    ["the photograph ratios", "THE PHOTOGRAPH."],
    ["the option-group advice", "HOW IT IS CHOSEN."],
    ["the always-wrong list", "Always wrong:"],
    ["motion is punctuation", "Motion is punctuation"],
    ["the market block", "THE MARKET THIS SELLS INTO"],
  ] as const) {
    check(!free.system.includes(needle), `free mode does not get ${what}`);
    check(banded.system.includes(needle), `and turning the flag off restores ${what}`);
  }
  /* The standard is not one of them — it survives the flag in both positions. */
  check(
    banded.system.replace(/\s+/g, " ").includes("still remember about it an hour later"),
    "the standard is not a design opinion the flag removes",
  );

  /* The two that read as rules but are about the ANSWER, not the page. */
  check(free.system.includes("Specify. A section"), "free mode still has to give values");
  check(free.system.includes(`Mark a node "optional"`), "and still marks what is optional");

  console.log("\nhow long the page is");

  check(!/never more than \d/.test(free.user), "free mode is given no section count");
  check(!/\d-\d+ sections/.test(free.user), "nor a range");
  check(
    free.user.includes("not its length"),
    "it is told the length is part of what it is deciding",
  );
  check(
    free.system.length < banded.system.length - 3000,
    "the free prompt is thousands of characters shorter",
    `free ${free.system.length} · banded ${banded.system.length}`,
  );

  console.log("\nwhat the checking refuses, and what it keeps");

  const one = vet(
    {
      name: "the-workshop-door", role: "media", signature: true, dark: true,
      padding: "statement", bg: true, brief: "A full-bleed photograph of the door.",
      nodes: [{ el: "image", ratio: 1.2 }],
    },
    "about",
  );
  check(one?.band.pattern === "the-workshop-door", "the model's own name is kept verbatim", one?.band.pattern);
  check(one?.band.role === "media" && one.band.padding === "statement", "role and padding survive");
  check(one?.band.dark === true && one.band.mayHaveBg === true, "dark and bg survive");
  check(one?.spec !== null, "and the nodes inside it become the spec");

  /* A role outside the seven the audit and stage 3 read is not a role. */
  const odd = vet({ name: "x", role: "atmosphere", nodes: [{ el: "text" }] }, "about");
  check(odd?.band.role === "content", "an invented role falls back to content", odd?.band.role);
  check(odd?.band.padding === "standard", "an absent padding falls back to standard");

  /* Not taste: a table, a form or a row of cards over a photograph is
     unreadable, and the prompt says so before this ever fires. */
  for (const role of ["commerce", "proof", "utility"]) {
    const r = vet({ name: "x", role, bg: true, nodes: [{ el: "table" }] }, "product");
    check(r?.band.mayHaveBg === false, `bg is refused behind a ${role} section`);
  }
  const media = vet({ name: "x", role: "media", bg: true, nodes: [{ el: "image" }] }, "about");
  check(media?.band.mayHaveBg === true, "but kept behind a media one");

  /* The one thing free mode still borrows from `vetSpec`. */
  const shop = vet(
    { name: "x", role: "commerce", nodes: [{ el: "product" }, { el: "bound", slot: "atc" }] },
    "about",
  );
  check(
    !JSON.stringify(shop?.spec ?? "").includes('"el":"product"'),
    "a buy box on a page with no product is still dropped",
  );

  console.log("\nthe motionPlan nothing asked for");

  {
    /* An order excludes BOTH places that instruct the build model to write this
       field — DESIGN_SYSTEM and the ## Animation block — so it arrives missing
       and the repair is the only thing that has ever added one. On a measured
       build the repair did not. It is written from the spec instead. */
    const { __motionPlanFromForTest: from } = await import("../lib/ai/designServer");
    const band = (pattern: string, nodes: unknown[]) => ({
      role: "content", pattern, signature: false, dark: false, padding: "standard",
      motion: null, mayHaveBg: false, brief: null, spec: { nodes },
    });

    const plan = from({
      vertical: "free", archetype: "E", patternIds: [], motionIds: [],
      sections: [
        band("cover-plate", [
          { el: "heading", anim: { reveal: "fade-up" } },
          { el: "col", children: [{ el: "image", anim: { hover: "grow", reveal: "fade" } }] },
        ]),
        band("the-standfirst", [{ el: "text" }]),
      ],
    } as never);

    check(plan.includes("cover-plate:"), "one line per section, named as the design named it");
    check(plan.includes("fade-up") && plan.includes("fade"), "carrying the reveals it asked for");
    check(plan.includes("grow"), "and the hovers, found at any depth");
    check(
      /the-standfirst: none/.test(plan),
      "a section that asked for nothing says none — that is a real answer",
      plan,
    );

    const silent = from({
      vertical: "free", archetype: "E", patternIds: [], motionIds: [],
      sections: [band("x", [{ el: "text" }])],
    } as never);
    check(silent.length > 0, "a page where nothing moves still gets a plan", silent);
  }

  console.log("\nthe section that carries the page");

  {
    /* The prompt no longer says what a signature is, so the fallback may not
       assume it. Reading the answer's own weight is what replaced it. */
    const { __pickSignatureForTest: pick } = await import("../lib/design/sectionSpec");
    const band = (role: string, nodes: number, signature = false) => ({
      role, pattern: role, signature, dark: false, padding: "standard",
      motion: null, mayHaveBg: false, brief: null,
      spec: { nodes: Array.from({ length: nodes }, () => ({ el: "text" })) },
    });

    const picked = pick([
      band("hero", 40), band("utility", 1), band("commerce", 15), band("proof", 18),
    ] as never);
    check(picked === 2 || picked === 3, "the heaviest non-hero section is chosen", `index ${picked}`);
    check(picked !== 1, "not the one-node ticker that happened to come first");
    check(picked !== 0, "and never the hero, however heavy");

    const already = pick([band("hero", 40), band("media", 3, true), band("proof", 20)] as never);
    check(already === 1, "an answer that marked exactly one is left alone", `index ${already}`);
  }

  const nothing = vet({ role: "content" }, "about");
  check(nothing?.spec === null, "a section with no nodes is a band with no spec, not a crash");
  check(vet("a section", "about") === null, "and a string is not a section");

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
