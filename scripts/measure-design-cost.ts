/* ==========================================================================
   WHAT THE DESIGN STAGE COSTS, PER PAGE, ON THE MODEL CURRENTLY PINNED.

       npx tsx scripts/measure-design-cost.ts            one home page
       PAGES=home,product npx tsx scripts/measure-design-cost.ts

   THIS SPENDS REAL MONEY. One page of the design stage, per page named. That
   is the price of replacing an estimate with a measurement, and the estimate is
   the thing that decides which model this product runs on.

   WHY THIS AND NOT A FULL BUILD. The number wanted is the design stage alone —
   `DESIGN_MODEL` is 8% of a page's tokens and about 91% of its bill, and stage
   3 is DeepSeek, already measured, unchanged by this question. A full build
   would cost the DeepSeek half again to learn nothing new, and take seven
   minutes doing it.

   WHY IT CALLS `planSpecs` RATHER THAN ASSEMBLING A PROMPT. A script that
   rebuilds the ask by hand measures a prompt production does not send. The
   argument object below is copied from `lib/build/runner.ts` — the
   `freeDesignEnabled()` branch, which is the one that runs — and if that call
   site changes shape, this stops compiling rather than silently measuring
   something else.

   THE PRICES ARE AN INPUT, NOT A FACT THIS SCRIPT KNOWS. Token counts are
   measured; dollars are those counts times a rate that lives in `RATES` below
   and has to be kept honest by a person reading the pricing page. A rate that
   has gone stale makes the dollars wrong while the tokens stay right, so both
   are printed.
   ========================================================================== */
import { createRequire } from "node:module";
import Module from "node:module";
import { readFileSync } from "node:fs";

/* `lib/ai/skills.ts` imports "server-only", which exists to throw if bundled
   into a browser and cannot be resolved by Node outside Next's build. Every
   script in here that reaches into lib/ stands in for it the same way, and it
   must be registered before the dynamic imports that pull the chain in. */
const require_ = createRequire(import.meta.url);
const resolve_ = (
  Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string }
)._resolveFilename;
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

/* ==========================================================================
   DOLLARS PER MILLION TOKENS, BY MODEL.

   Read off Anthropic's pricing page by a person. Kept here rather than fetched
   so a measurement never depends on a network call, and listed per model so a
   comparison across models is arithmetic rather than memory.

   A MODEL WITH NO ROW STILL GETS MEASURED. Tokens are printed either way and
   the dollar line says the rate is missing — a script that refuses to run
   because it does not know a price would withhold the half of the answer it
   does know.
   ========================================================================== */
const RATES: Record<string, { in: number; out: number }> = {
  /* Read off platform.claude.com/docs/en/about-claude/pricing on 2026-09-23.
     Base input and output; cache writes and reads are cheaper and this stage
     does not use them, so the number here is a ceiling rather than an estimate. */
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
};

/* The brief the number is measured on. HEXWOOD, because it is the worked
   example the product now ships — so this measures the stage on the kind of
   brief a merchant is being shown how to write, rather than on a short one
   that would flatter it. */
async function main(): Promise<void> {
  const { PROMPT_EXAMPLE } = await import("../lib/briefOptions");
  const { VISUAL_STYLES } = await import("../lib/styleTokens");
  const { planSpecs, freeDesignEnabled } = await import("../lib/design/sectionSpec");
  const { modelName } = await import("../lib/ai/provider");

  /* `modelName` answers null when no key is configured for the role — which is
     a real state (`providerName("design")` returns "none") and must not become
     the string "null" used as a lookup key. */
  const model = modelName("design");
  if (!model) {
    console.log("\n  No design model configured — nothing to measure.\n");
    return;
  }
  const rate = RATES[model];
  const pages = (process.env.PAGES ?? "home").split(",").map((p) => p.trim()).filter(Boolean);

  const style = VISUAL_STYLES.find((s) => s.id === "dark");

  console.log(`\n  model        ${model}`);
  console.log(`  free design  ${freeDesignEnabled()}`);
  console.log(`  pages        ${pages.join(", ")}`);
  console.log(`  rate         ${rate ? `$${rate.in}/M in · $${rate.out}/M out` : "UNKNOWN — add a row to RATES"}\n`);

  let totalIn = 0;
  let totalOut = 0;

  for (const pageType of pages) {
    const started = Date.now();
    /* Copied from the `freeDesignEnabled()` branch of `lib/build/runner.ts`.
       The palette is that branch's own fallback, so no colour picked here can
       make the prompt shorter than production's. */
    const outcome = await planSpecs({
      pageType,
      order: null,
      sell: "Halloween costumes, decor, candy, props and party supplies",
      storeType: "d2c",
      market: null,
      styleLabel: style?.label ?? "dark",
      styleBlurb: style?.blurb ?? "",
      prompt: PROMPT_EXAMPLE,
      tokens: { bg: "#FFFFFF", ink: "#111114", accent: "#111114", band: "#F7F7F8" },
    } as never);

    const secs = Math.round((Date.now() - started) / 100) / 10;
    totalIn += outcome.usage.input;
    totalOut += outcome.usage.output;

    const cost = rate
      ? (outcome.usage.input * rate.in + outcome.usage.output * rate.out) / 1_000_000
      : null;

    console.log(
      `  ${pageType.padEnd(12)} in ${String(outcome.usage.input).padStart(7)} · ` +
        `out ${String(outcome.usage.output).padStart(7)} · ` +
        `${String(outcome.order?.sections.length ?? 0).padStart(2)} sections · ` +
        `${secs}s` +
        (cost === null ? "" : ` · $${cost.toFixed(3)}`) +
        (outcome.reason ? `  REASON: ${outcome.reason}` : ""),
    );
  }

  console.log("");
  if (rate) {
    const total = (totalIn * rate.in + totalOut * rate.out) / 1_000_000;
    console.log(
      `  TOTAL        in ${totalIn} · out ${totalOut} · $${total.toFixed(3)} ` +
        `· $${(total / pages.length).toFixed(3)} per page`,
    );
  } else {
    console.log(`  TOTAL        in ${totalIn} · out ${totalOut} · no rate for ${model}`);
  }

  /* The design stage is not the whole bill. Said here so the number is never
     quoted as the cost of a page — DeepSeek writes the HTML afterwards and the
     export runs on top of that. */
  console.log(
    `\n  This is the DESIGN STAGE ONLY. Stage 3 (DeepSeek, ~$0.052/page) and the\n` +
      `  export (~$0.177/page) are on top and unchanged by which model designs.\n`,
  );
}

void main();
