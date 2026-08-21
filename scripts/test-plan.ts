/* ==========================================================================
   The resolver's mandatory test — SPEC §2.4.

       npx tsx scripts/test-plan.ts

   Every vertical against every page type, from an EMPTY brief. That is the
   guarantee being tested: a merchant who filled in Step 1 and Step 2 and
   nothing else still gets a complete, buildable order. If this passes, an empty
   brief cannot produce a basic page, because the page's structure was never the
   model's job.

   No test runner in this repo, so this is a script that exits non-zero. That is
   enough for a pre-commit check and it needs no dependency.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

/* See scripts/server-only.cjs — Node cannot resolve the real package outside
   Next's build, and everything under lib/ imports it. */
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
};

/* EVERY page type in the catalogue, read from the catalogue.

   It used to be eight, hand-picked, and that is how eighteen page types came to
   share the About arc without anyone noticing: the list tested the types someone
   had thought about. Read from `PAGE_CATEGORIES`, a type added to the product
   is a type this test covers the same day. */
const PAGE_TYPES: string[] = [];

let failures = 0;
function check(ok: boolean, label: string, detail = ""): void {
  if (ok) return;
  failures++;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

async function main(): Promise<void> {
  const { planPage, seedFor, _plan, _fallbackArcTypes } = await import("../lib/design/plan");
  const { sliceIds } = await import("../lib/ai/skills");
  const { VERTICAL_CHIPS } = await import("../lib/verticals");
  const { PAGE_CATEGORIES } = await import("../lib/pageCatalog");

  PAGE_TYPES.push(...PAGE_CATEGORIES.flatMap((c) => c.pages.map((p) => p.id)));

  /* ---- does every page type have an arc of its own? --------------------- */

  const generic = _fallbackArcTypes(PAGE_TYPES);
  console.log(`page types in the catalogue  ${PAGE_TYPES.length}`);
  if (generic.length > 0) {
    console.log(`  \x1b[33mstill on a generic arc\x1b[0m  ${generic.join(", ")}`);
    failures++;
  } else {
    console.log("  every type has its own arc or is deliberately minimal");
  }

  /* ---- and does a page that should sell something, sell something? ------ */

  const SHOULD_SELL: Record<string, number> = {
    product: 1,
    collection: 2,
    home: 1,
    sale: 2,
    bundle: 1,
    "gift-card": 1,
    upsell: 1,
    lookbook: 1,
    "lp-launch": 1,
    "lp-bfcm": 2,
    "lp-discount": 1,
    "lp-influencer": 1,
  };

  const patternIds = new Set(sliceIds("patterns"));
  const motionIds = new Set(sliceIds("motion"));

  console.log("§2.4 — every vertical × every page type, empty brief");
  console.log(`${VERTICAL_CHIPS.length} verticals × ${PAGE_TYPES.length} page types = ${VERTICAL_CHIPS.length * PAGE_TYPES.length}\n`);

  let orders = 0;
  const emptyPatternSlots: string[] = [];

  for (const chip of VERTICAL_CHIPS) {
    for (const pageType of PAGE_TYPES) {
      const brief = {
        /* Empty brief: the chip and a style, nothing else. */
        whatYouSell: chip.label,
        verticalSlug: chip.slug,
        visualStyle: "minimal",
      };
      const seed = seedFor("test-store.myshopify.com", pageType, "minimal");

      let order;
      try {
        order = planPage(brief as never, pageType, seed);
      } catch (err) {
        failures++;
        console.log(`  ✗ THREW  ${chip.slug} / ${pageType} — ${(err as Error).message}`);
        continue;
      }
      orders++;

      const where = `${chip.slug}/${pageType}`;
      check(order.sections.length > 0, `${where}: no sections`);

      /* The page types that exist to sell something must contain something to
         buy, in every vertical. This is the check that would have caught a Sale
         page with no products on it. */
      const wanted = SHOULD_SELL[pageType];
      if (wanted) {
        const got = order.sections.filter((s) => s.role === "commerce" && s.pattern).length;
        check(got >= wanted, `${where}: ${got} commerce section(s), wanted ${wanted}`);
      }
      check(order.vertical === chip.slug, `${where}: wrong vertical`, order.vertical);
      check(
        order.sections.filter((s) => s.signature).length === 1,
        `${where}: signature count`,
        String(order.sections.filter((s) => s.signature).length),
      );

      for (const s of order.sections) {
        if (s.pattern === "") {
          emptyPatternSlots.push(`${where}:${s.role}`);
          continue;
        }
        check(patternIds.has(s.pattern), `${where}: unknown pattern`, s.pattern);
        if (s.motion) check(motionIds.has(s.motion), `${where}: unknown motion`, s.motion);
      }

      /* Composition floors the audit will also enforce. Checked here so a
         resolver that cannot satisfy them is caught before a model is asked to
         build from one. */
      if (order.sections.length >= 3) {
        check(new Set(order.sections.map((s) => s.padding)).size >= 3, `${where}: <3 paddings`);
        check(order.sections.some((s) => s.dark), `${where}: no dark band`);
        const adjacentDark = order.sections.some((s, i) => s.dark && order.sections[i + 1]?.dark);
        check(!adjacentDark, `${where}: two dark bands adjacent`);
      }
    }
  }

  console.log(`orders produced        ${orders}`);
  console.log(`slots with no pattern  ${emptyPatternSlots.length}${emptyPatternSlots.length ? "  " + [...new Set(emptyPatternSlots.map((s) => s.split(":")[1]))].join(", ") : ""}`);

  /* ---- the checkpoint: two stores in one vertical must differ ------------- */

  console.log("\nCHECKPOINT — three stores, vertical skincare, page home");
  const brief = { whatYouSell: "Skincare", verticalSlug: "skincare", visualStyle: "minimal" };
  const stores = ["aurelia-skin.myshopify.com", "nordbloom.myshopify.com", "petal-and-clay.myshopify.com"];
  const plans = stores.map((d) => planPage(brief as never, "home", seedFor(d, "home", "minimal")));

  plans.forEach((p, i) => {
    console.log(`  ${stores[i].split(".")[0].padEnd(16)} ${p.sections.map((s) => s.pattern || "—").join(" · ")}`);
  });

  /* Slot overlap, pairwise. The threshold is the plan's: two stores in the same
     vertical must differ in at least 40% of slots, or the seed is not wired in
     and every store in a trade gets one page with different words. */
  let worst = 0;
  for (let a = 0; a < plans.length; a++)
    for (let b = a + 1; b < plans.length; b++) {
      const same = plans[a].sections.filter((s, i) => s.pattern === plans[b].sections[i]?.pattern).length;
      const overlap = same / plans[a].sections.length;
      worst = Math.max(worst, overlap);
      console.log(`  overlap ${stores[a].split(".")[0]} vs ${stores[b].split(".")[0]}: ${(overlap * 100).toFixed(0)}%`);
    }
  check(worst <= 0.6, `slot overlap ${(worst * 100).toFixed(0)}% exceeds 60%`);

  /* ---- stability: the same store must not drift ------------------------- */

  console.log("\nstability");
  const twice = [0, 1].map(() => planPage(brief as never, "home", seedFor(stores[0], "home", "minimal")));
  check(
    JSON.stringify(twice[0]) === JSON.stringify(twice[1]),
    "same store, same page, same plan",
  );
  console.log("  same store rebuilt → identical plan:", JSON.stringify(twice[0]) === JSON.stringify(twice[1]) ? "✓" : "✗");

  const otherPage = planPage(brief as never, "product", seedFor(stores[0], "product", "minimal"));
  const homePage = twice[0];
  const rolled = otherPage.sections[0].pattern !== homePage.sections[0].pattern;
  console.log("  different page type → different roll:", rolled ? "✓" : "— (same hero, allowed but check the seed)");

  /* ---- an unknown store still gets an order ----------------------------- */

  console.log("\nfree text with no chip");
  const freeform = planPage(
    { whatYouSell: "hand-thrown stoneware mugs", verticalSlug: null, visualStyle: "minimal" } as never,
    "home",
    seedFor("kiln.myshopify.com", "home", "minimal"),
  );
  console.log(`  vertical ${freeform.vertical} · ${freeform.sections.length} sections · signature ${freeform.sections.findIndex((s) => s.signature)}`);
  check(freeform.sections.length > 0, "free text produced no order");
  check(freeform.vertical === "general", "free text should fall to general", freeform.vertical);

  /* ---- the buy box has to be dense ------------------------------------- */

  console.log("\na bare buy box");

  const { audit } = await import("../lib/design/audit");
  const pdpOrder = planPage(
    { whatYouSell: "Audio & headphones", verticalSlug: "audio-headphones", visualStyle: "dark" } as never,
    "product",
    seedFor("audun.myshopify.com", "product", "dark"),
  );

  const buyBox = (extras: unknown[]) => ({
    sections: pdpOrder.sections.map((s, i) => ({
      type: "section",
      pattern: s.pattern,
      role: s.role,
      css: { padding: "96px 56px" },
      children:
        i === 0
          ? [{ type: "product", title: "Theta Pro", price: "$134", atcText: "Add to cart", extras }]
          : [{ type: "heading", level: 2, text: "92% of 2,000 buyers" }],
    })),
  });

  const bare = audit(buyBox([]) as never, pdpOrder);
  const dense = audit(
    buyBox([
      { type: "text", text: "Ships in 24 hours" },
      { type: "text", text: "30-day returns" },
    ]) as never,
    pdpOrder,
  );

  /* Printed rather than silent. `check` above says nothing on success, which is
     right for a 2,970-order sweep and wrong for three targeted assertions — a
     block that prints nothing cannot be read. */
  const thin = (p: string[]) => p.filter((x) => /extra row/.test(x));
  console.log(`  bare column   → ${thin(bare).length} complaint(s)`);
  console.log(`  two rows      → ${thin(dense).length} complaint(s)`);
  check(thin(bare).length === 1, "a bare title-price-cart column is flagged", thin(bare)[0]?.slice(0, 52));
  check(thin(dense).length === 0, "two rows is enough to satisfy it");

  /* And it must not fire on a page with no buy box at all. */
  const homeOrder = planPage(
    { whatYouSell: "Audio & headphones", verticalSlug: "audio-headphones", visualStyle: "dark" } as never,
    "home",
    seedFor("audun.myshopify.com", "home", "dark"),
  );
  const home = audit(
    {
      sections: homeOrder.sections.map((s) => ({
        type: "section",
        pattern: s.pattern,
        role: s.role,
        css: { padding: "96px 56px" },
        children: [{ type: "heading", level: 2, text: "One harvest, one farm" }],
      })),
    } as never,
    homeOrder,
  );
  console.log(`  no buy box    → ${thin(home).length} complaint(s)`);
  check(thin(home).length === 0, "and silent on a page with no buy box");

  console.log();
  if (failures === 0) {
    console.log("PASS");
  } else {
    console.log(`FAIL — ${failures} problem${failures === 1 ? "" : "s"}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
