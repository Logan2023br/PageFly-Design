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

  const wrapped = vetSpec({
    nodes: [{ el: "row", children: [{ el: "col", children: [{ el: "heading" }] }] }],
  })!;
  check(
    specDelta(built("heading"), wrapped).missing.length === 0,
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

  console.log(`\n${failures === 0 ? "PASS" : `${failures} FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
