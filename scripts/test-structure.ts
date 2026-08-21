/* ==========================================================================
   The model decides the section list. What happens when it decides badly?

       npx tsx scripts/test-structure.ts

   Handing structure back to the model is the thing this codebase already tried
   and reverted: v1 asked per page and every page came back with the same
   skeleton. The safeguards are the whole difference between that and this, and a
   safeguard nobody exercised is a safeguard that does not work.

   So this asserts the failure modes rather than the happy path — an invented
   pattern id, a banned one, a buy box on a page with no product, a product page
   with no buy box, a page too thin to build, and two page types answering with
   one sequence. Each has to degrade to something buildable, and the whole build
   must survive the model answering nothing at all.

   The provider is stubbed. No key, no network, no bill.
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
  const hit = resolve_.call(this, request, ...args);
  return /lib[/\\]ai[/\\]provider\.ts$/.test(hit) ? require_.resolve("./provider-stub.cjs") : hit;
} as never;

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const g = globalThis as unknown as { __PFD_REPLY?: unknown; __PFD_ASKED: { system: string }[] };

/** Make the stub answer with this pages object. */
function reply(pages: Record<string, unknown>): void {
  g.__PFD_REPLY = JSON.stringify({ pages });
}

async function main(): Promise<void> {
  const { decideStructure } = await import("../lib/design/structure");
  const { orderFromSlots, seedFor } = await import("../lib/design/plan");

  const ask = (pageTypes: string[], refSections: string[] | null = null) => ({
    sell: "wireless over-ear headphones",
    storeType: "single-product",
    vertical: "audio",
    pageTypes,
    refSections,
  });

  /* ---- the answer we want, and that it reaches an Order ------------------ */

  console.log("a good answer");
  reply({
    home: [
      "hero-full-bleed-scrim",
      "certification-logo-row",
      "spec-bars",
      "collection-featured-row",
      "full-bleed-quote-band",
      "faq-accordion",
      "cta-band-full",
    ],
    product: [
      "product-detail-gallery",
      "guarantee-row",
      "spec-grid-4x2",
      "deep-dive-split",
      "comparison-table",
      "newsletter-inline",
    ],
  });
  let out = await decideStructure(ask(["home", "product"]));
  check(out.reason === null, "the call was used", out.reason);
  check(out.plans.size === 2, "both page types ordered", `${out.plans.size}`);
  check(out.fallbacks.length === 0, "nothing fell back", out.fallbacks.map((f) => f.pageType).join(", "));
  check(
    out.plans.get("home")?.[0]?.role === "hero",
    "home opens on a hero",
    out.plans.get("home")?.[0]?.pattern,
  );
  check(
    out.plans.get("product")?.[0]?.role === "commerce",
    "product opens on its buy box",
    out.plans.get("product")?.[0]?.pattern,
  );

  /* The seam. `finish()` had only ever seen arc output; a model's list has to
     come out with the same guarantees or the audit will fail every page. */
  const brief = { whatYouSell: "headphones", verticalSlug: "audio", visualStyle: "editorial" };
  const order = orderFromSlots(
    brief as never,
    seedFor("x.myshopify.com", "home", "editorial"),
    out.plans.get("home")!,
  );
  check(order.sections.filter((s) => s.signature).length === 1, "exactly one signature band");
  check(order.sections.some((s) => s.dark), "at least one dark band");
  check(
    order.sections.every((s, i) => !(s.dark && order.sections[i + 1]?.dark)),
    "no two dark bands adjacent",
  );
  check(new Set(order.sections.map((s) => s.padding)).size >= 3, "at least three paddings");
  check(
    order.sections.filter((s) => s.mayHaveBg).length <= 2,
    "at most two bands may carry a photograph",
    `${order.sections.filter((s) => s.mayHaveBg).length}`,
  );

  /* ---- and now the ways it goes wrong ----------------------------------- */

  console.log("\nan invented pattern id");
  reply({
    home: [
      "hero-full-bleed-scrim",
      "hero-parallax-supreme",
      "spec-bars",
      "collection-featured-row",
      "faq-accordion",
      "cta-band-full",
    ],
  });
  out = await decideStructure(ask(["home"]));
  check(
    !out.plans.get("home")?.some((s) => s.pattern === "hero-parallax-supreme"),
    "the invented id is gone",
  );
  check(out.plans.has("home"), "and the page survived without it");
  check(
    out.repairs.some((r) => r.includes("not a pattern id")),
    "the drop was reported, not silent",
    out.repairs[0],
  );

  console.log("\na buy box on a page with no product");
  reply({
    about: [
      "hero-product-lead",
      "story-band",
      "certification-logo-row",
      "process-steps",
      "full-bleed-quote-band",
      "newsletter-inline",
    ],
  });
  out = await decideStructure(ask(["about"]));
  check(
    !out.plans.get("about")?.some((s) => s.pattern === "hero-product-lead"),
    "the buy box is gone from the about page",
  );
  check(
    out.repairs.some((r) => r.includes("no product")),
    "and the reason was recorded",
  );

  console.log("\na product page with no buy box");
  reply({
    product: [
      "hero-editorial-stack",
      "story-band",
      "spec-bars",
      "faq-accordion",
      "comparison-table",
      "cta-band-full",
    ],
  });
  out = await decideStructure(ask(["product"]));
  const fixed = out.plans.get("product");
  check(fixed?.[0]?.pattern === "product-detail-gallery", "the buy box was put back, at the front", fixed?.[0]?.pattern);
  check(
    out.repairs.some((r) => r.includes("requires it")),
    "and it says the page type required it",
  );

  console.log("\na page too thin to build");
  reply({ home: ["hero-full-bleed-scrim", "cta-band-full"] });
  out = await decideStructure(ask(["home"]));
  check(!out.plans.has("home"), "the answer was refused");
  check(
    out.fallbacks.some((f) => f.pageType === "home"),
    "and home falls back to its arc",
    out.fallbacks[0]?.reason,
  );

  console.log("\ntwo page types, one sequence — the v1 failure returning");
  const same = [
    "hero-full-bleed-scrim",
    "certification-logo-row",
    "spec-bars",
    "collection-featured-row",
    "faq-accordion",
    "cta-band-full",
  ];
  reply({ home: [...same], lookbook: [...same] });
  out = await decideStructure(ask(["home", "lookbook"]));
  check(out.plans.size === 1, "only one of them is kept", `${out.plans.size}`);
  check(out.plans.has("home"), "the first one keeps its answer");
  check(
    out.fallbacks.some((f) => f.pageType === "lookbook" && f.reason.includes("identical")),
    "the second falls back, and the reason names it",
    out.fallbacks.find((f) => f.pageType === "lookbook")?.reason,
  );

  console.log("\nthe model answers for a page nobody asked about");
  reply({ contact: ["hero-centered-statement", "story-band", "lead-form-split"] });
  out = await decideStructure(ask(["home"]));
  check(out.plans.size === 0, "nothing is used");
  check(
    out.fallbacks.some((f) => f.pageType === "home" && f.reason.includes("did not answer")),
    "home falls back and says the model skipped it",
  );

  console.log("\nnot JSON at all");
  g.__PFD_REPLY = "I would be happy to help you order these pages!";
  out = await decideStructure(ask(["home"]));
  check(out.plans.size === 0, "nothing is used");
  check(out.reason === "no usable JSON in the answer", "and the reason is legible", out.reason);

  console.log("\nthe model ran out of room mid-thought");
  g.__PFD_REPLY = { text: '{"pages":{"home":["hero-full', truncated: true };
  out = await decideStructure(ask(["home"]));
  check(out.reason === "ran out of output budget", "truncation is named as itself", out.reason);

  console.log("\nturned off by env");
  g.__PFD_REPLY = undefined;
  process.env.USE_MODEL_STRUCTURE = "false";
  out = await decideStructure(ask(["home"]));
  check(out.reason === "USE_MODEL_STRUCTURE=false", "the flag is honoured", out.reason);
  check(out.usage.input === 0 && out.usage.output === 0, "and nothing was spent");
  delete process.env.USE_MODEL_STRUCTURE;

  /* ---- what the model is actually told ---------------------------------- */

  console.log("\nthe question");
  reply({ home: [] });
  await decideStructure(ask(["home"], ["product detail with a gallery", "reviews grid"]));
  const system = g.__PFD_ASKED.at(-1)!.system;
  check(system.includes("hero:"), "the vocabulary is grouped by role");
  check(!system.includes("Fails when:"), "and carries ids only, not the pattern descriptions");
  /* Asserted on the block's CONTENT, not on the slug: `sliceSkill` strips the
     `<!--#audio-->` heading, so looking for the word "audio" was looking for the
     one part of the file that never arrives. Audio's block is the archetype
     line, its signature and its ban list. */
  check(
    system.includes("spec-bars") && system.includes("ban playful"),
    "this trade's own block is in there — signature and ban list",
  );

  console.log();
  console.log(failures === 0 ? "PASS" : `FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
