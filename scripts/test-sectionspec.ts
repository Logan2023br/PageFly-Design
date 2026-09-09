/* ==========================================================================
   The spec checker, without a model.

   Every assertion here is a rule the design pass can break and the build pass
   can be told about. They are cheap, deterministic, and run in a second —
   which is the point: the expensive failures on this branch (invented motion
   ids, a page with no hero) were all shapes a test like this catches before
   anyone pays for a completion.

       npx tsx scripts/test-sectionspec.ts

   No network. No API key. Nothing here calls a model.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

/* See scripts/server-only.cjs — Node cannot resolve the real package outside a
   Next build, and every module in the pipeline imports it. */
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

/** A section as the tree schema shapes one, thin enough to assert against. */
function built(...types: string[]) {
  return { pattern: "x", children: types.map((type) => ({ type })) } as never;
}

async function main(): Promise<void> {
  const { vetSpec, specDelta, specProblems } = await import("@/lib/design/specCheck");

  console.log("\nvetSpec");

  const clean = vetSpec({
    nodes: [
      { el: "heading", scale: "oversized", anim: { reveal: "fade-up" } },
      { el: "image", ratio: 0.82, anim: { hover: "grow" } },
    ],
  });
  check(clean !== null && clean.nodes.length === 2, "keeps two good nodes");
  check(clean?.nodes[0].scale === "oversized", "keeps a known scale");
  check(clean?.nodes[1].anim?.hover === "grow", "keeps a known hover");

  const badEl = vetSpec({ nodes: [{ el: "carousel3000" }, { el: "text" }] });
  check(badEl?.nodes.length === 1, "drops an unknown element type", "carousel3000");
  check(badEl?.nodes[0].el === "text", "keeps the sibling of a dropped node");

  const badAnim = vetSpec({ nodes: [{ el: "button", anim: { hover: "explode", reveal: "fade" } }] });
  check(badAnim?.nodes[0].anim?.hover === undefined, "drops an unknown hover");
  check(badAnim?.nodes[0].anim?.reveal === "fade", "keeps the known reveal beside it");

  const badScale = vetSpec({ nodes: [{ el: "heading", scale: "gigantic" }] });
  check(badScale?.nodes[0].scale === undefined, "drops an unknown scale");

  const delay = vetSpec({ nodes: [{ el: "text", anim: { reveal: "fade", delay: 99 } }] });
  check(delay?.nodes[0].anim?.delay === 6, "clamps delay to 6");

  const nested = vetSpec({
    nodes: [
      { el: "row", gap: 72, children: [{ el: "col", basis: "44%", children: [{ el: "text" }] }] },
    ],
  });
  check(nested?.nodes[0].children?.[0].children?.[0].el === "text", "keeps three levels of nesting");
  check(nested?.nodes[0].children?.[0].basis === "44%", "keeps a well-formed basis");

  const badBasis = vetSpec({ nodes: [{ el: "col", basis: "half" }] });
  check(badBasis?.nodes[0].basis === undefined, "drops a basis that is not a percentage");

  /* The three losses the first real build found. Every one of them threw away
     a complete design over a shape, and the run cost 9,161 output tokens. */
  const wrapped = vetSpec({
    nodes: [{ el: "section", padding: "64px 56px", children: [{ el: "heading" }, { el: "text" }] }],
  });
  check(wrapped?.nodes.length === 2, "a root `section` is unwrapped, not refused");
  check(wrapped?.nodes[0].el === "heading", "…and its children come up a level");

  const extras = vetSpec({
    nodes: [{ el: "product", extras: [{ el: "row", children: [{ el: "icon" }, { el: "text" }] }] }],
  });
  check(extras?.nodes[0].children?.length === 1, "`extras` counts as children on a product");
  check(
    extras?.nodes[0].children?.[0].children?.length === 2,
    "…and the rows inside them survive",
  );

  const noted = vetSpec({ nodes: [{ el: "text", note: "the review count as a real figure" }] });
  check(noted?.nodes[0].note === "the review count as a real figure", "a note is kept");
  check(
    /* 320, not the 200 this asserted for months after the cap moved. The note
       stopped being a stylesheet in prose when `css` took the values, so it was
       let back out to a sentence with a reason in it. */
    (vetSpec({ nodes: [{ el: "text", note: "x".repeat(400) }] })?.nodes[0].note ?? "").length === 320,
    "a runaway note is cut to 320 characters",
  );

  /* Markers for the bound parts of a buy box. A marker naming a slot nobody has
     is worse than no marker: the exporter resolves it to nothing and the buy box
     loses its price with no error anywhere. */
  const marks = vetSpec({
    nodes: [
      { el: "bound", slot: "atc" },
      { el: "bound", slot: "elbow" },
      { el: "bound" },
      { el: "text" },
    ],
  });
  check(marks?.nodes.length === 2, "a marker with a real slot survives", String(marks?.nodes.length));
  check(marks?.nodes[0].slot === "atc", "and keeps its slot");
  check(
    !marks?.nodes.some((n) => n.el === "bound" && n.slot === "elbow"),
    "a slot nobody has is dropped, not passed on",
  );

  check(vetSpec({ nodes: [] }) === null, "an empty node list is null, not an empty spec");
  check(vetSpec({ nodes: [{ el: "nope" }] }) === null, "a spec of only bad nodes is null");
  check(vetSpec(null) === null, "null in, null out");
  check(vetSpec({ nodes: "heading" }) === null, "a non-array node list is null");

  console.log("\nspecDelta");

  const spec = vetSpec({
    nodes: [{ el: "heading" }, { el: "text" }, { el: "button" }, { el: "image" }],
  })!;

  const exact = built("heading", "text", "button", "image");
  const d1 = specDelta(exact, spec);
  check(d1.missing.length === 0 && d1.added.length === 0, "an exact build has no delta");

  const extra = built("heading", "text", "button", "image", "divider", "icon");
  const d2 = specDelta(extra, spec);
  check(d2.missing.length === 0, "extras are not missing");
  check(d2.added.join(",") === "divider,icon", "extras are listed", d2.added.join(","));

  const short = built("heading", "text");
  const d3 = specDelta(short, spec);
  check(d3.missing.join(",") === "button,image", "shortfalls are listed", d3.missing.join(","));

  const twice = vetSpec({ nodes: [{ el: "image" }, { el: "image" }] })!;
  check(
    specDelta(built("image"), twice).missing.join(",") === "image",
    "counts, not just presence",
  );

  const boxed = vetSpec({
    nodes: [{ el: "row", children: [{ el: "col", children: [{ el: "heading" }] }] }],
  })!;
  check(
    specDelta(built("heading"), boxed).missing.length === 0,
    "row and col are not counted — a build may reach the same layout with fewer wrappers",
  );

  console.log("\nspecProblems · soft");

  check(specProblems(exact, spec, false).length === 0, "an exact build is clean");
  check(specProblems(extra, spec, false).length === 0, "extras pass in soft mode");
  check(specProblems(short, spec, false).length === 1, "a shortfall is one problem");
  check(
    specProblems(short, spec, false)[0].includes("button"),
    "the problem names the missing element",
  );

  console.log("\nspecProblems · binding");

  check(specProblems(exact, spec, true).length === 0, "an exact build is clean when binding");
  check(specProblems(extra, spec, true).length === 1, "extras are a problem when binding");
  check(
    specProblems(extra, spec, true)[0].includes("divider"),
    "the problem names the unwanted element",
  );
  check(specProblems(short, spec, true).length === 1, "a shortfall is still a problem");

  console.log("\nspecProblems · optional");

  const opt = vetSpec({ nodes: [{ el: "heading" }, { el: "divider", optional: true }] })!;
  check(specProblems(built("heading"), opt, false).length === 0, "an absent optional node is fine");
  check(specProblems(built("heading"), opt, true).length === 0, "…in binding mode too");

  console.log("\nthe three stages agree on what an element is");

  {
    /* IT SHIPPED BROKEN ONCE. `countdown` went into this file's element set,
       into the tree schema, into the renderer and into the exporter — and not
       into `00-contract.md`, which is the alphabet stage 3 builds from and
       opens by saying "This is the entire alphabet. There is nothing else." So
       stage 2b asked for a timer, stage 3 had never heard of the node, and
       built the nearest thing it knew: `custom` markup that counts nothing. */
    const { readFileSync } = await import("node:fs");
    const { ELEMENT_NAMES } = await import("@/lib/design/specCheck");
    const contract = readFileSync("skills/00-contract.md", "utf8");

    const unknown = ELEMENT_NAMES.filter((e) => !contract.includes(`{"type":"${e}"`));
    check(
      unknown.length === 0,
      "every element stage 2b may ask for is in stage 3's alphabet",
      unknown.length ? `missing: ${unknown.join(", ")}` : `${ELEMENT_NAMES.length} checked`,
    );
    check(contract.includes('"type":"countdown"'), "countdown among them — the one that was not");
  }

  console.log(`\n${failures === 0 ? "PASS" : `${failures} FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
