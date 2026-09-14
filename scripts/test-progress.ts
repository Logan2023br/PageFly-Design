/* ==========================================================================
   The bar must not lie.

       npx tsx scripts/test-progress.ts

   A progress bar is allowed to be imprecise. It is not allowed to say a page
   is finished before it is — that is the difference between a merchant who
   waits and a merchant who opens the Library, finds nothing, and files a bug.

   So the one property under test here is: `buildFraction` reaches 1 only when
   every page has actually settled. Everything else it does is pacing.

   The fraction it sums is produced by the runner from characters the model has
   streamed, capped there at 0.92 for a reason that file explains at length —
   the expected total is a measurement with a shelf life, and this codebase has
   twice shipped a stale one. This file assumes the cap can fail and checks
   that the total is still safe when it does.
   ========================================================================== */

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { buildFraction } = await import("@/components/generating/GeneratingScreen");
  const pct = (s: number, t: number, p: Record<string, number> = {}) =>
    Math.round(buildFraction(s, t, p) * 100);

  console.log("\nnothing to build");

  check(pct(0, 0) === 0, "no plan is 0%, not NaN", String(pct(0, 0)));
  check(pct(3, 0) === 0, "and neither is a total of zero with pages somehow settled");

  console.log("\none page, which is where the old bar was at its worst");

  check(pct(0, 1) === 0, "nothing started");
  check(pct(0, 1, { a: 0.5 }) === 50, "halfway through the only page");
  check(pct(0, 1, { a: 0.92 }) === 92, "at the runner's cap");
  check(pct(1, 1) === 100, "and 100 only once it has actually landed");

  /* THE PROPERTY. Before the page settles, whatever the model streamed, the
     bar must stop short. */
  check(pct(0, 1, { a: 0.92 }) < 100, "a page still in flight cannot read 100");

  console.log("\nfour pages, which is how many the model designs at once");

  check(pct(0, 4, { a: 0.5, b: 0.5, c: 0.5, d: 0.5 }) === 50, "all four half done");
  check(pct(2, 4, { c: 0.5, d: 0.5 }) === 75, "two landed, two half done");
  check(pct(3, 4, { d: 0.92 }) === 98, "three landed and the last nearly there");
  check(pct(3, 4, { d: 0.92 }) < 100, "but still not 100");
  check(pct(4, 4) === 100, "which arrives when the fourth does");

  console.log("\na settled page is not also in flight");

  /* The runner deletes a page from the map when it settles. If it ever stops
     doing that, this is the shape of the bug: the page is counted twice and
     the bar runs past the end. The clamp is the backstop. */
  check(
    pct(4, 4, { a: 0.9, b: 0.9, c: 0.9, d: 0.9 }) === 100,
    "double-counting is clamped rather than overflowing",
    String(pct(4, 4, { a: 0.9, b: 0.9, c: 0.9, d: 0.9 })),
  );

  console.log("\nand the cap failing is survivable");

  check(pct(0, 2, { a: 5, b: 5 }) === 100, "a fraction above 1 is clamped per page");
  check(pct(0, 2, { a: -3 }) === 0, "and a negative one counts for nothing");

  console.log("\nrubbish from an older deploy does not blank the bar");

  /* jsonb from a row written before this column existed, or a value that came
     back as something unexpected. NaN here would render as a bar with no width
     and no error anywhere — the worst kind of failure this screen can have. */
  const junk = { a: NaN, b: Infinity, c: undefined, d: "x" } as unknown as Record<
    string,
    number
  >;
  check(Number.isFinite(buildFraction(1, 4, junk)), "the answer is a number", String(buildFraction(1, 4, junk)));
  check(pct(1, 4, junk) === 25, "and counts only what actually landed", String(pct(1, 4, junk)));

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
