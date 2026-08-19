/* ==========================================================================
   Phase 3 — does telling the model which pattern to build stop it reasoning
   about which pattern to build?

   The whole rebuild rests on that one claim. v1 measured about 14,000 reasoning
   tokens on a page where the model chose its own structure. If a page whose
   structure is decided for it comes back near 14,000 as well, the claim is
   wrong: the pages will still be better, but the saving is not there and the
   budget should not assume it.

   Three prompts, hand-assembled in the §7 shape, called directly. No resolver
   yet — that is the point. This runs BEFORE plan.ts so the number decides how
   much to build rather than justifying what was already built.

       npx tsx scripts/phase3-cost.ts

   Costs three page-builds of DeepSeek. That is the price of replacing three
   estimates with one measurement.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";

/* `lib/ai/skills.ts` imports "server-only", a package that exists to throw if
   it is ever bundled into a browser. Node cannot resolve it outside Next's
   build, so a script that reaches into lib/ has to stand in for it. Registered
   before any dynamic import below, because the dynamic imports are what pull
   the chain in. */
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

for (const file of [".env.local", ".env.production.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && !process.env[m[1]])
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* absent is fine */
  }
}
process.env.AI_PROVIDER = "deepseek";

/* One vertical for all three, so the only thing that varies is the page type.
   Skincare because it is archetype B — the efficacy-led arc, the one with the
   most slots — so this measures the expensive end rather than the easy one. */
const VERTICAL = "skincare";
const STORE = "aurelia-skin.myshopify.com";

/**
 * Orders in the shape the resolver will emit.
 *
 * Written by hand from `20-patterns.md` and the `skincare` block of
 * `30-verticals.md` — the same choices a correct resolver would make, so the
 * measurement is of the prompt shape rather than of a resolver that does not
 * exist yet.
 */
const ORDERS: Record<string, { role: string; pattern: string; dark: boolean; padding: string; signature: boolean; motion: string | null }[]> = {
  home: [
    { role: "hero", pattern: "hero-full-bleed-scrim", dark: false, padding: "statement", signature: false, motion: "reveal" },
    { role: "utility", pattern: "guarantee-row", dark: false, padding: "utility", signature: false, motion: null },
    { role: "media", pattern: "split-media-alternating", dark: false, padding: "standard", signature: false, motion: "reveal" },
    { role: "proof", pattern: "before-after-pair", dark: true, padding: "statement", signature: true, motion: "reveal" },
    { role: "content", pattern: "ingredient-list", dark: false, padding: "standard", signature: false, motion: null },
    { role: "media", pattern: "lookbook-strip", dark: false, padding: "dense", signature: false, motion: "hover" },
    { role: "proof", pattern: "social-proof-wall", dark: false, padding: "standard", signature: false, motion: "stagger-grid" },
    { role: "conversion", pattern: "cta-band-full", dark: true, padding: "statement", signature: false, motion: null },
  ],
  product: [
    { role: "hero", pattern: "hero-product-lead", dark: false, padding: "standard", signature: false, motion: null },
    { role: "utility", pattern: "guarantee-row", dark: false, padding: "utility", signature: false, motion: null },
    { role: "proof", pattern: "ingredient-list", dark: false, padding: "standard", signature: false, motion: "reveal" },
    { role: "media", pattern: "before-after-pair", dark: true, padding: "statement", signature: true, motion: null },
    { role: "content", pattern: "routine-steps", dark: false, padding: "standard", signature: false, motion: "stagger-grid" },
    { role: "proof", pattern: "social-proof-wall", dark: false, padding: "standard", signature: false, motion: null },
    { role: "content", pattern: "faq-accordion", dark: false, padding: "dense", signature: false, motion: null },
    { role: "conversion", pattern: "cta-band-full", dark: true, padding: "statement", signature: false, motion: null },
  ],
  collection: [
    { role: "hero", pattern: "hero-centered-statement", dark: false, padding: "standard", signature: false, motion: "reveal" },
    { role: "utility", pattern: "certification-logo-row", dark: false, padding: "utility", signature: false, motion: null },
    { role: "content", pattern: "usecase-tiles-overlay", dark: false, padding: "standard", signature: true, motion: "hover" },
    { role: "media", pattern: "full-bleed-quote-band", dark: true, padding: "statement", signature: false, motion: null },
    { role: "content", pattern: "size-fit-guide", dark: false, padding: "standard", signature: false, motion: null },
    { role: "conversion", pattern: "newsletter-inline", dark: false, padding: "utility", signature: false, motion: null },
  ],
};

const PADDING_PX: Record<string, string> = {
  statement: "140px 56px",
  standard: "96px 56px",
  dense: "72px 56px",
  utility: "56px 56px",
};

async function main(): Promise<void> {
  const { loadSkills, sliceSkill } = await import("../lib/ai/skills");
  const { getProvider } = await import("../lib/ai/provider");

  const provider = getProvider();
  if (!provider) {
    console.log("No model configured — set DEEPSEEK_API_KEY.");
    process.exitCode = 1;
    return;
  }

  const rows: {
    page: string;
    input: number;
    output: number;
    reasoning: number | null;
    json: number;
    seconds: number;
    ok: boolean;
  }[] = [];

  for (const [pageType, order] of Object.entries(ORDERS)) {
    const patternIds = order.map((s) => s.pattern);
    const motionIds = [...new Set(order.map((s) => s.motion).filter(Boolean))] as string[];

    /* §7 — longest-lived first. The stable prefix must come first or DeepSeek's
       prefix cache is thrown away on every page; it would still work, and the
       bill would be several times what it should be. */
    const system = [
      loadSkills("design"),
      sliceSkill("patterns", patternIds),
      sliceSkill("verticals", [VERTICAL]),
      sliceSkill("motion", motionIds),
    ]
      .filter(Boolean)
      .join("\n\n");

    const user = [
      `Store sells: clinical skincare for sensitive skin`,
      `Store type: single-product`,
      ``,
      `Visual style: Minimal & clean — restrained type, generous whitespace`,
      ``,
      `Design this page: ${pageType}`,
      ``,
      `Palette and faces — work inside these, introduce nothing else.`,
      `  background  #FFFFFF`,
      `  text        #14161A`,
      `  accent      #3F6B5B`,
      `  band        #F4F1EC`,
      `  heading font-family: Inter`,
      `  body font-family: Inter`,
      `  corner radius 6px`,
      ``,
      `THE ORDER — build exactly these sections, in this order:`,
      ...order.map(
        (s, i) =>
          `${i + 1} · ${s.role} · ${s.pattern} · ${s.dark ? "dark" : "light"} · ` +
          `${PADDING_PX[s.padding]} · signature:${s.signature ? "yes" : "no"} · ` +
          `motion:${s.motion ?? "none"}`,
      ),
      ``,
      `Return the JSON object now.`,
    ].join("\n");

    process.stdout.write(`${pageType.padEnd(11)} … `);
    const t0 = Date.now();
    let completion;
    try {
      completion = await provider.complete({
        system,
        user,
        maxTokens: 48_000,
        signal: AbortSignal.timeout(420_000),
      });
    } catch (err) {
      console.log(`FAILED — ${(err as Error).message.slice(0, 80)}`);
      continue;
    }
    const seconds = (Date.now() - t0) / 1000;

    /* The JSON the model actually wrote, as tokens, so reasoning and answer can
       be told apart in the table rather than inferred from the total. */
    const jsonTokens = Math.round(completion.text.length / 3.6);
    let ok = false;
    try {
      ok = typeof JSON.parse(completion.text) === "object";
    } catch {
      ok = false;
    }

    rows.push({
      page: pageType,
      input: completion.usage.input,
      output: completion.usage.output,
      reasoning: completion.reasoning,
      json: jsonTokens,
      seconds,
      ok,
    });
    console.log(`${seconds.toFixed(0)}s · out ${completion.usage.output} · reasoning ${completion.reasoning ?? "?"}`);
  }

  if (rows.length === 0) {
    console.log("\nNothing measured.");
    process.exitCode = 1;
    return;
  }

  console.log();
  console.log("page         input   output   reasoning   JSON    valid   seconds");
  console.log("─".repeat(68));
  for (const r of rows)
    console.log(
      r.page.padEnd(12) +
        String(r.input).padStart(6) +
        String(r.output).padStart(9) +
        String(r.reasoning ?? "—").padStart(12) +
        String(r.json).padStart(7) +
        (r.ok ? "     yes" : "      NO") +
        r.seconds.toFixed(0).padStart(10),
    );

  const reasoning = rows.map((r) => r.reasoning ?? 0).filter((n) => n > 0);
  if (reasoning.length === 0) {
    console.log("\nProvider reported no reasoning count — the claim cannot be tested here.");
    return;
  }

  const mean = reasoning.reduce((a, b) => a + b, 0) / reasoning.length;
  console.log();
  console.log(`mean reasoning   ${mean.toFixed(0)}`);
  console.log(`v1 measured      ~14,000`);
  console.log();
  /* Stated as a threshold rather than left to the reader: the plan says near
     14,000 means the claim is wrong, so the script says which it is. */
  if (mean >= 12_000)
    console.log(
      "CLAIM DOES NOT HOLD. Reasoning is not materially lower than v1. The pages\n" +
        "will still be better, but budget for the same spend, not less.",
    );
  else if (mean >= 8_000)
    console.log(
      "PARTIAL. Reasoning is down but not by the margin the plan assumed.\n" +
        "Treat the token target as optimistic.",
    );
  else
    console.log(
      "CLAIM HOLDS. A model told which pattern to build spends materially less\n" +
        "deciding what to build.",
    );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
