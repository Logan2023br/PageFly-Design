/* ==========================================================================
   Build one About page for real — all three stages, the live models.

       npx tsx scripts/build-about.ts

   Why an About page and not the usual home: an About page and a Contact page
   each shipped carrying a full buy box, and the guard against that is new.
   The structural test proves the guard refuses one. This proves a live run
   still builds a page, and reports whether the design model reached for a buy
   box at all — which is the only way to learn whether one guard was enough.

   Reads BUILD_BRIEF, writes BUILD_OUT.
   ========================================================================== */
import { createRequire } from "node:module";
import Module from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

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

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const OUT = process.env.BUILD_OUT!;
const PAGE_TYPE = process.env.BUILD_PAGE ?? "about";

function countEls(value: unknown, want: Set<string>, key: string): number {
  if (Array.isArray(value)) return value.reduce((n, v) => n + countEls(v, want, key), 0);
  if (!value || typeof value !== "object") return 0;
  const o = value as Record<string, unknown>;
  let n = want.has(String(o[key])) ? 1 : 0;
  for (const v of Object.values(o)) n += countEls(v, want, key);
  return n;
}

async function main() {
  /* Through the real schema, not straight off disk: `buildPage` reads fields a
     hand-written brief forgets — `brandColors`, `referenceImages` — and a
     TypeError there is a script bug wearing a pipeline bug's clothes. */
  const { briefSchema } = await import("../lib/validation");
  const brief = briefSchema.parse(JSON.parse(readFileSync(process.env.BUILD_BRIEF!, "utf8")));
  const { buildPage } = await import("../lib/generate/mock");
  const { verticalFor, pageHasOneProduct } = await import("../lib/design/plan");
  const { VISUAL_STYLES } = await import("../lib/styleTokens");
  const styleDef = (id: string) => VISUAL_STYLES.find((x) => x.id === id);
  const deckPlan = await import("../lib/design/deckPlan");
  const sectionSpec = await import("../lib/design/sectionSpec");
  const designServer = await import("../lib/ai/designServer");
  const { modelName } = await import("../lib/ai/provider");

  console.log(`page type: ${PAGE_TYPE} · has a product to bind to: ${pageHasOneProduct(PAGE_TYPE)}`);
  console.log(`models — design: ${modelName("design")} · build: ${modelName()}\n`);

  const base = buildPage({
    brief, pageType: PAGE_TYPE, pageId: PAGE_TYPE, index: 1, copyIndex: 1, copyTotal: 1, variant: 0,
  });
  const t = base.tokens;
  const out: Record<string, unknown> = {
    pageType: PAGE_TYPE,
    models: { design: modelName("design"), build: modelName() },
  };

  /* ---- STAGE 1 ---------------------------------------------------------- */
  const ask = {
    sell: brief.whatYouSell, storeType: brief.storeType, market: brief.market ?? null,
    vertical: verticalFor(brief), pageTypes: [PAGE_TYPE], prompt: brief.prompt,
    styleLabel: styleDef(brief.visualStyle)?.label ?? brief.visualStyle,
    styleBlurb: styleDef(brief.visualStyle)?.blurb ?? "",
    density: t.density ?? "normal",
    tokens: { bg: t.bg, ink: t.ink, accent: t.accent, band: t.surfaceAlt },
    refSections: null, refStyle: null,
  };
  console.log("stage 1 · deck plan (Opus)…");
  const deck = await deckPlan.planDeck(ask as never);
  const order = deck.plans.get(PAGE_TYPE) ?? null;
  out.stage1 = { usage: deck.usage, reason: deck.reason, fallbacks: deck.fallbacks, repairs: deck.repairs, order };
  if (!order) {
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(`  stopped — ${deck.reason}`);
    return;
  }
  console.log(`  ${order.sections.length} bands · ${order.sections.map((s: { pattern: string }) => s.pattern).join(", ")}`);
  console.log(`  in ${deck.usage.input} / out ${deck.usage.output}\n`);

  /* ---- STAGE 2b --------------------------------------------------------- */
  const specAsk = {
    pageType: PAGE_TYPE, order, sell: ask.sell, storeType: ask.storeType, market: ask.market,
    styleLabel: ask.styleLabel, styleBlurb: ask.styleBlurb, prompt: ask.prompt, tokens: ask.tokens,
  };
  console.log("stage 2b · section spec (Opus)…");
  const specs = await sectionSpec.planSpecs(specAsk as never);
  const refused = specs.refused ?? {};
  const buyBoxTries = refused["(buy box, page has no product)"] ?? 0;
  out.stage2b = {
    usage: specs.usage, reason: specs.reason, dropped: specs.dropped, refused,
    buyBoxElementsRefused: buyBoxTries,
    pageStyle: specs.pageStyle ?? null,
    specs: [...specs.specs.entries()].map(([i, s]) => ({ band: i, spec: s })),
  };
  console.log(`  specs for ${specs.specs.size}/${order.sections.length} bands · in ${specs.usage.input} / out ${specs.usage.output}`);
  console.log(`  buy-box elements refused by the new guard: ${buyBoxTries}`);
  const otherRefused = Object.entries(refused).filter(([k]) => !k.startsWith("(buy box"));
  console.log(`  other refusals: ${otherRefused.length ? otherRefused.map(([k, v]) => `${k}×${v}`).join(", ") : "none"}\n`);

  /* ---- STAGE 3 ---------------------------------------------------------- */
  const withSpecs = {
    ...order,
    sections: order.sections.map((s: Record<string, unknown>, i: number) => ({ ...s, spec: specs.specs.get(i) ?? null })),
    pageStyle: specs.pageStyle,
  };
  console.log("stage 3 · build the tree (DeepSeek)…");
  const design = await designServer.designPageTree({
    sell: brief.whatYouSell, prompt: brief.prompt, storeType: brief.storeType, market: brief.market ?? null,
    style: brief.visualStyle, styleLabel: ask.styleLabel, styleBlurb: ask.styleBlurb, density: t.density,
    reference: base.refHints, refSections: null, refStyle: null, structure: null, order: withSpecs,
    deckSize: 1, storeDomain: "embernoak.myshopify.com", verticalSlug: brief.verticalSlug ?? null,
    pageLabel: base.label, pageType: base.pageType,
    tokens: { bg: t.bg, ink: t.ink, accent: t.accent, band: t.surfaceAlt, border: t.border,
              fontHeading: t.fontDisplay, fontBody: t.fontBody, radius: t.radius },
  } as never);

  if (!design.used) {
    out.stage3 = { used: false, reason: design.reason, usage: design.usage };
    writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log(`  stopped — ${design.reason}`);
    return;
  }

  const shop = countEls(design.tree.sections, new Set(["product", "bound"]), "type");
  out.stage3 = {
    used: true, usage: design.usage, auditFailures: design.auditFailures,
    sections: design.tree.sections.length,
    buyBoxElementsInTree: shop,
    motionPlan: (design.tree as { motionPlan?: string }).motionPlan ?? null,
    images: Object.keys(design.images).length,
    videos: Object.keys(design.videos).length,
    tree: design.tree,
  };
  console.log(`  ${design.tree.sections.length} sections · ${design.auditFailures} audit problems on the first pass`);
  console.log(`  in ${design.usage.input} / out ${design.usage.output}`);
  console.log(`  images ${Object.keys(design.images).length} · videos ${Object.keys(design.videos).length}`);
  console.log(`\n  BUY-BOX ELEMENTS IN THE FINAL TREE: ${shop}${shop ? "  ← still leaking" : "  ← clean"}`);

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\n→ ${OUT}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
