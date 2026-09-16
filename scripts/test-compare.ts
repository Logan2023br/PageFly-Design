/* ==========================================================================
   Comparing two windows, and refusing to call three events a trend.

       npx tsx scripts/test-compare.ts

   THE SUBTRACTION IS NOT THE RISK. Getting `now - before` right takes no
   testing. What takes testing is everything that decides whether the answer is
   worth printing, because this product's numbers are small enough that a naive
   summary would be wrong in a way that still looks authoritative: four builds
   becoming one is a 75% fall, and it is also one person having a quiet Tuesday.

   So the assertions below are mostly about silence — which movements the
   comparison declines to call a finding, and why. A summary that always has a
   story is a summary that invents one, and the first reader who checks a claim
   and finds noise behind it never reads the block again.
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
};

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const step = (key: string, label: string, events: number) => ({
  key, label, events, visitors: events, note: "", where: "", unit: "browser" as const,
});
const slice = (key: string, label: string, count: number) => ({ key, label, count, visitors: count });

function view(over: Partial<any> = {}): any {
  return {
    from: "", to: "", days: 30, empty: false,
    funnel: [], cta: [], signin: [], registerResults: [], registerFields: [],
    gallery: [], builds: { started: 0, completed: 0, failed: 0, cancelled: 0 },
    durations: [], pages: [], shared: [], rows: [],
    ...over,
  };
}

async function main(): Promise<void> {
  const { compareViews } = await import("../lib/analytics/compare.js");
  const find = (c: any, key: string) =>
    [...c.good, ...c.bad, ...c.thin, ...c.flat].find((x: any) => x.key === key);

  console.log("\nwhat counts as a finding");

  /* Well over the volume floor and moving hard: this is the shape the block
     exists to surface. */
  let c = compareViews(
    view({ funnel: [step("landing", "Landing", 200)] }),
    view({ funnel: [step("landing", "Landing", 100)] }),
  );
  check(c.good.length === 1 && c.good[0].key === "landing", "a doubling on a big base is good news");
  check(c.good[0].pct === 1, "with the percentage against the earlier window", String(c.good[0].pct));

  c = compareViews(
    view({ funnel: [step("landing", "Landing", 100)] }),
    view({ funnel: [step("landing", "Landing", 200)] }),
  );
  check(c.bad.length === 1, "and a halving is not");

  console.log("\nand what does not");

  /* THE CASE THIS FILE IS REALLY FOR. Four to one is minus seventy-five
     percent and it is one person. */
  c = compareViews(
    view({ builds: { started: 0, completed: 1, failed: 0, cancelled: 0 } }),
    view({ builds: { started: 0, completed: 4, failed: 0, cancelled: 0 } }),
  );
  check(c.good.length === 0 && c.bad.length === 0, "4 → 1 is not called a collapse");
  check(
    Boolean(find(c, "completed")) && find(c, "completed").verdict === "thin",
    "it is kept and marked thin, not dropped",
    find(c, "completed")?.verdict,
  );
  check(
    c.headline.includes("quá nhỏ"),
    "and the headline says so rather than claiming a result",
    c.headline,
  );

  /* Big base, small move: visible, and not a finding either. */
  c = compareViews(
    view({ funnel: [step("landing", "Landing", 102)] }),
    view({ funnel: [step("landing", "Landing", 100)] }),
  );
  check(c.good.length === 0 && c.bad.length === 0, "100 → 102 is flat");
  check(c.flat.length === 1, "counted as flat, so the reader knows it was looked at", String(c.flat.length));

  /* A figure that never happened in either window is not a measurement that
     held steady, and padding the flat tally with four never-started builds
     would make the summary look more thorough than it is. */
  c = compareViews(view(), view({ funnel: [step("landing", "L", 0)] }));
  check(c.flat.length === 0, "and a figure that is zero on both sides is not counted at all", String(c.flat.length));

  console.log("\nwhich direction is good news");

  c = compareViews(
    view({ builds: { started: 0, completed: 0, failed: 14, cancelled: 0 } }),
    view({ builds: { started: 0, completed: 0, failed: 2, cancelled: 0 } }),
  );
  check(c.bad.some((x: any) => x.key === "failed"), "more failed builds is bad, not good");

  c = compareViews(
    view({ signin: [slice("not_registered", "Not registered", 20)] }),
    view({ signin: [slice("not_registered", "Not registered", 4)] }),
  );
  check(c.bad.some((x: any) => x.key === "not_registered"), "so is a rise in people turned away");

  c = compareViews(
    view({ signin: [slice("success", "Signed in", 20)] }),
    view({ signin: [slice("success", "Signed in", 4)] }),
  );
  check(c.good.some((x: any) => x.key === "success"), "and a rise in people getting in is not");

  console.log("\nthe rates, which are the point");

  /* Traffic doubles, exports double: every count is up and nothing improved.
     The rate is the number that says so. */
  const now = view({
    funnel: [step("landing", "Landing", 400), step("cta", "Pressed a CTA", 100)],
  });
  const before = view({
    funnel: [step("landing", "Landing", 200), step("cta", "Pressed a CTA", 50)],
  });
  c = compareViews(now, before);
  check(c.good.some((x: any) => x.key === "landing"), "the counts read as growth");
  const rate = find(c, "rate_cta");
  check(Boolean(rate), "and the gap between them is measured too");
  check(rate.verdict === "flat", "which correctly reports no improvement at all", rate.verdict);
  check(rate.now === 25 && rate.before === 25, "25% both windows", `${rate.before} → ${rate.now}`);

  /* And a real change in the share does surface. */
  c = compareViews(
    view({ funnel: [step("landing", "Landing", 200), step("cta", "CTA", 80)] }),
    view({ funnel: [step("landing", "Landing", 200), step("cta", "CTA", 40)] }),
  );
  check(find(c, "rate_cta")?.verdict === "good", "a share that really moved is a finding");
  check(find(c, "rate_cta")?.delta === 20, "reported in points, not in percent of a percent", String(find(c, "rate_cta")?.delta));

  /* A gap whose top is tiny cannot be divided by honestly. */
  c = compareViews(
    view({ funnel: [step("landing", "L", 4), step("cta", "C", 2)] }),
    view({ funnel: [step("landing", "L", 2), step("cta", "C", 2)] }),
  );
  check(!find(c, "rate_cta"), "a rate over four visits is not computed at all");

  console.log("\nthings that disappeared");

  /* A value present before and absent now is a change, and walking only the
     current window would lose it in silence. */
  c = compareViews(
    view({ cta: [] }),
    view({ cta: [slice("hero", "Hero", 40)] }),
  );
  check(find(c, "hero")?.now === 0, "a slice that went to zero is still compared", String(find(c, "hero")?.now));
  check(c.bad.some((x: any) => x.key === "hero"), "and reads as bad news");

  console.log("\nnothing at all");

  c = compareViews(view(), view());
  check(c.good.length === 0 && c.bad.length === 0 && c.thin.length === 0, "two empty windows produce no claims");
  check(!c.headline.includes("cải thiện"), "and no headline about improvement", c.headline);

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
