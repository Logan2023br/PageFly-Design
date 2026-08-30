/* Dump every prompt and every output of the three design stages, for real.
   npx tsx scripts/dump-pipeline.ts   → writes JSON to the path in OUT. */
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

const OUT = process.env.DUMP_OUT!;

async function main() {
  const brief = JSON.parse(readFileSync(process.env.DUMP_BRIEF!, "utf8"));
  const { buildPage } = await import("../lib/generate/mock");
  const { verticalFor } = await import("../lib/design/plan");
  const { VISUAL_STYLES } = await import("../lib/styleTokens");
  const styleDef = (id: string) => VISUAL_STYLES.find((x) => x.id === id);
  const deckPlan = await import("../lib/design/deckPlan");
  const sectionSpec = await import("../lib/design/sectionSpec");
  const designServer = await import("../lib/ai/designServer");
  const { modelName } = await import("../lib/ai/provider");

  const pageType = "home";
  const base = buildPage({ brief, pageType, pageId: pageType, index: 1, copyIndex: 1, copyTotal: 1, variant: 0 });
  const t = base.tokens;

  const ask = {
    sell: brief.whatYouSell,
    storeType: brief.storeType,
    market: brief.market ?? null,
    vertical: verticalFor(brief),
    pageTypes: [pageType],
    prompt: brief.prompt,
    styleLabel: styleDef(brief.visualStyle)?.label ?? brief.visualStyle,
    styleBlurb: styleDef(brief.visualStyle)?.blurb ?? "",
    density: t.density ?? "normal",
    tokens: { bg: t.bg, ink: t.ink, accent: t.accent, band: t.surfaceAlt },
    refSections: null,
    refStyle: null,
  };

  const out: Record<string, unknown> = { models: { design: modelName("design"), default: modelName() } };

  /* ---- STAGE 1 ---- */
  out.stage1 = { ask, prompts: deckPlan.__promptsForTest(ask as never) };
  console.log("stage1 prompts dumped · calling Opus…");
  const deck = await deckPlan.planDeck(ask as never);
  const order = deck.plans.get(pageType) ?? null;
  out.stage1Result = {
    usage: deck.usage, reason: deck.reason, model: (deck as never as { model?: string }).model ?? null,
    fallbacks: deck.fallbacks, repairs: deck.repairs, order,
  };
  if (!order) { writeFileSync(OUT, JSON.stringify(out, null, 2)); console.log("no order — stopped"); return; }

  /* ---- STAGE 2b ---- */
  const specAsk = {
    pageType, order, sell: ask.sell, storeType: ask.storeType, market: ask.market,
    styleLabel: ask.styleLabel, styleBlurb: ask.styleBlurb, prompt: ask.prompt, tokens: ask.tokens,
  };
  out.stage2b = { ask: { ...specAsk, order: "(xem stage1Result.order)" }, prompts: sectionSpec.__specPromptsForTest(specAsk as never) };
  console.log("stage2b prompts dumped · calling Opus…");
  const specs = await sectionSpec.planSpecs(specAsk as never);
  out.stage2bResult = {
    usage: specs.usage, reason: specs.reason, model: specs.model,
    specs: [...specs.specs.entries()].map(([i, s]) => ({ band: i, spec: s })),
  };

  /* ---- STAGE 3 ---- */
  const withSpecs = {
    ...order,
    sections: order.sections.map((s: Record<string, unknown>, i: number) => ({ ...s, spec: specs.specs.get(i) ?? null })),
  };
  const designInput = {
    sell: brief.whatYouSell, prompt: brief.prompt, storeType: brief.storeType, market: brief.market ?? null,
    style: brief.visualStyle, styleLabel: ask.styleLabel, styleBlurb: ask.styleBlurb, density: t.density,
    reference: base.refHints, refSections: null, refStyle: null, structure: null, order: withSpecs,
    deckSize: 1, storeDomain: "collectionpages.myshopify.com", verticalSlug: brief.verticalSlug ?? null,
    pageLabel: base.label, pageType: base.pageType,
    tokens: { bg: t.bg, ink: t.ink, accent: t.accent, band: t.surfaceAlt, border: t.border,
              fontHeading: t.fontDisplay, fontBody: t.fontBody, radius: t.radius },
  };
  out.stage3 = { prompts: await designServer.__designPromptsForTest(designInput as never) };
  console.log("stage3 prompts dumped (KHÔNG gọi model)");

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log("→", OUT);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
