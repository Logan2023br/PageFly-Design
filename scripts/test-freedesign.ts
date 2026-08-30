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

  console.log("\nthe flag");
  check(!freeDesignEnabled(), "off unless FREE_DESIGN is exactly true");

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
  /* Two things stay, and neither is taste — see the note on `freeDesignEnabled`. */
  check(free.system.includes("SEVEN ARE REFUSED"), "the export's CSS limits stay");
  check(/never more than \d/.test(free.user), "and the section budget stays");

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
