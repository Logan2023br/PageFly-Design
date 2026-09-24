/* ==========================================================================
   WHAT A CALL COST, AND THE THREE WAYS THAT NUMBER GOES WRONG QUIETLY.

       npx tsx scripts/test-pricing.ts

   The admin screen is about to put dollars next to token counts. Tokens are
   measured and cannot lie; dollars are tokens times a rate somebody typed in,
   and every way that multiplication fails produces a plausible number:

     1. AN UNPRICED MODEL COSTS ZERO. Add a model, forget the rate, and its
        row reads $0.00 — which is not "we do not know", it is "it was free".
        The screen then under-reports the bill and nothing anywhere throws.

     2. A CACHE HIT BILLED AT THE MISS RATE. DeepSeek charges $0.006/M for a
        hit and $0.30/M for a miss — fifty times apart. Our own export runs at
        55% cached, so getting this wrong roughly triples the reported input
        cost of the single biggest spender.

     3. THE RATE IS PER MILLION, and a factor of 1e6 dropped anywhere gives an
        answer that is still a number.
   ========================================================================== */

import { RATES, costOf } from "../lib/ai/pricing";

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/* ---- 1. an unpriced model is unknown, not free -------------------------- */
ok(
  "a model with no rate returns null, not 0",
  costOf("some-model-nobody-priced", { input: 1_000_000, output: 1_000_000 }) === null,
  "0 would read as free and under-report the bill",
);

/* ---- 2. the cache hit is billed at the hit rate ------------------------- */
/* The real shape of one export band: mostly cached input. */
const ds = costOf("deepseek-v4-flash", { input: 273_566, output: 135_679, cached: 151_040 });
ok("deepseek is priced", ds !== null);
if (ds !== null) {
  const miss = ((273_566 - 151_040) / 1e6) * 0.3;
  const hit = (151_040 / 1e6) * 0.006;
  const out = (135_679 / 1e6) * 1.2;
  ok("cached input is billed at the hit rate", near(ds, miss + hit + out), `$${ds.toFixed(4)}`);

  /* This is the measured cost of a real ten-band export, from the run logged
     in this repo's own cost probe. If the arithmetic drifts, it drifts here. */
  ok("and it matches the measured export", Math.abs(ds - 0.2005) < 0.0005, `$${ds.toFixed(4)} vs $0.2005`);

  const naive = (273_566 / 1e6) * 0.3 + out;
  ok(
    "AND IT IS NOT THE NAIVE NUMBER",
    !near(ds, naive),
    `billing every input token at the miss rate gives $${naive.toFixed(4)}`,
  );
}

/* ---- 3. per million, and the anthropic side ----------------------------- */
const opus = costOf("claude-opus-5-5", { input: 1_000_000, output: 1_000_000 });
ok("one million in and out of opus-5-5 is in + out", opus !== null && near(opus, 4 + 20), `$${opus}`);

const haiku = costOf("claude-haiku-4-5-20251001", { input: 500_000, output: 100_000 });
ok("haiku at half a million in", haiku !== null && near(haiku, 0.5 * 1 + 0.1 * 5), `$${haiku}`);

/* ---- 4. zero usage is zero, not null ------------------------------------ */
ok("a priced model with no tokens costs nothing", costOf("claude-opus-5-5", { input: 0, output: 0 }) === 0);

/* ---- 5. every model the code can actually choose has a rate ------------- */
/* The guard that catches (1) before it ships rather than after: if a new model
   id appears in the source, it must appear here too. */
const shipped = ["claude-opus-5-5", "deepseek-v4-flash", "claude-haiku-4-5-20251001"];
const unpriced = shipped.filter((m) => !(m in RATES));
ok("every model named in the source is priced", unpriced.length === 0, unpriced.join(" "));

console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
process.exit(bad === 0 ? 0 : 1);
