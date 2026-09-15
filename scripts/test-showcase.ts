/* ==========================================================================
   The front door's data, without a browser.

       npx tsx scripts/test-showcase.ts

   Most of these are about what does NOT come out. `/api/showcase` is the only
   public endpoint in the app, and everything in the database belongs to a real
   store — so the assertions that matter are the ones proving a merchant's
   domain, their brief and their own words about their business stay behind it.

   The rest is failure behaviour: a front door that errors because a demo run
   was deleted months ago is worse than one with a section missing, and nobody
   would notice the cause for weeks.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { readFileSync } from "node:fs";

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

/* The file store reads the same env the app does. */
for (const file of [".env.local"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* none */
  }
}

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

type LocalRun = { id: string; domain?: string; snapshot?: unknown };

/** Every run the local database holds, so the test can name real ones. */
function realRuns(): LocalRun[] {
  try {
    const db = JSON.parse(readFileSync(".pfd-dev-db.json", "utf8")) as { runs?: LocalRun[] };
    return (db.runs ?? []).filter(
      (r) => Array.isArray(r.snapshot) && (r.snapshot as unknown[]).length > 0,
    );
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const runs = realRuns();
  const ids = runs.map((r) => r.id);
  if (ids.length === 0) {
    console.log("\nNo saved runs in the local database — build a page first.\n");
    process.exit(0);
  }

  const { getRepo } = await import("@/lib/db");
  const { showcasePages, showcaseIds, showcaseSource, showcaseStore } = await import(
    "@/lib/showcase"
  );

  /* The domain with the MOST runs here, for the store-backed source below.
     Most rather than first: the cap and the fallback are both about a store
     holding more pages than one run does, and a store with a single run cannot
     tell either case from its opposite. */
  const byDomain = new Map<string, number>();
  for (const r of runs)
    if (r.domain) byDomain.set(r.domain, (byDomain.get(r.domain) ?? 0) + 1);
  /* ==========================================================================
     A SEEDED STORE, NOT WHICHEVER ONE THIS LAPTOP HAPPENS TO HAVE.

     These assertions used to pick the store with the most runs in the local
     database, which made them pass or fail on what somebody had been building
     that week. Skipping the nineteen newest pages ended that for good: every
     store in a dev database has fewer than twenty pages, so all of them
     publish nothing and three unrelated tests failed at once for a reason none
     of them was about.

     Thirty-one pages, seeded here, so what is under test is the code.
     ========================================================================== */
  const storeWithRuns = "fixture-store.myshopify.com";
  {
    const store = await import("@/lib/db").then((m) => m.getRepo());
    for (let i = 0; i < 31; i++) {
      await store.saveRun(
        {
          id: `fixture-${String(i).padStart(2, "0")}`,
          domain: storeWithRuns,
          createdAt: new Date(2025, 5, 1 + i).toISOString(),
          payload: "",
          pageCount: 1,
          tokens: 0,
          snapshot: [
            {
              id: `fx-${i}`,
              pageType: "home",
              label: `Fixture ${i}`,
              category: "core",
              categoryLabel: "Core",
              index: i,
              tokens: {},
              design: { tree: { sections: [] } },
            },
          ],
          sell: "things",
          styleLabel: "Warm",
        } as never,
        [],
      );
    }
  }
  void byDomain;

  /* ==========================================================================
     THE NEWEST PAGES ARE SKIPPED, and the failure this guards has no symptom.

     The showcase store is a working store: its most recent builds are briefs
     being tuned and pages rebuilt to compare wordings, and "newest first" is
     otherwise the whole rule — so the front door reached for exactly those.

     Skipping nineteen has one consequence worth a test of its own: a store
     with fewer than twenty pages now publishes NOTHING, and an empty marquee
     looks like a store with no runs, or a database that is down, or a deploy
     that did not take. It looks like anything except a rule working.
     ========================================================================== */
  console.log("\nthe newest nineteen are passed over");

  {
    const { getRepo: repoFor } = await import("@/lib/db");
    const store = repoFor();
    const page = (i: number) => ({
      id: `p-${i}`,
      pageType: "home",
      label: `Page ${i}`,
      category: "core",
      categoryLabel: "Core",
      index: i,
      tokens: {},
      /* Only pages with a tree are drawable — `pagesOf` skips the rest, so a
         stand-in without one would be counted here and not there. */
      design: { tree: { sections: [] } },
    });

    /* Thirty-one pages over thirty-one runs, newest last in the loop and
       therefore newest by `createdAt`. Nineteen skipped leaves twelve, which
       is exactly the cap — so this also proves the two rules compose rather
       than one eating the other. */
    const domain = "skip-test.myshopify.com";
    for (let i = 0; i < 31; i++) {
      await store.saveRun(
        {
          id: `run-${String(i).padStart(2, "0")}`,
          domain,
          createdAt: new Date(2026, 0, 1 + i).toISOString(),
          payload: "",
          pageCount: 1,
          tokens: 0,
          snapshot: [page(i)],
          sell: "things",
          styleLabel: "Warm",
        } as never,
        [],
      );
    }

    process.env.SHOWCASE_RUNS = "";
    process.env.SHOWCASE_STORE = domain;
    const shown = await showcasePages();

    check(shown.length === 12, "twelve cards, the cap", String(shown.length));
    /* Run 30 is the newest. Skipping nineteen means the first card is run 11. */
    check(
      shown[0]?.label === "Page 11",
      "and the first is the twentieth newest, not the newest",
      shown[0]?.label ?? "(none)",
    );
    check(
      !shown.some((p) => ["Page 30", "Page 29", "Page 12"].includes(p.label)),
      "none of the nineteen newest appear",
      shown.map((p) => p.label).join(", "),
    );

    /* The consequence, asserted rather than discovered on a deploy. */
    const small = "only-five.myshopify.com";
    for (let i = 0; i < 5; i++) {
      await store.saveRun(
        {
          id: `small-${i}`,
          domain: small,
          createdAt: new Date(2026, 1, 1 + i).toISOString(),
          payload: "",
          pageCount: 1,
          tokens: 0,
          snapshot: [page(i)],
          sell: "things",
          styleLabel: "Warm",
        } as never,
        [],
      );
    }
    process.env.SHOWCASE_STORE = small;
    check(
      (await showcasePages()).length === 0,
      "a store with fewer than twenty pages publishes nothing at all",
      "which is why /api/health reports showcasePages",
    );
  }

  console.log("\nnothing is published unless something is NAMED");

  /* The safety property, restated for two sources. It used to be "an unset list
     publishes nothing"; now an unset list falls through to a named store, so the
     property is that BOTH have to be silent before nothing is published. Getting
     this wrong is how a real merchant's pages end up on a public page. */
  process.env.SHOWCASE_RUNS = "";
  process.env.SHOWCASE_STORE = "";
  check(showcaseSource() === "none", "no runs and no store is a source of nothing");
  check((await showcasePages()).length === 0, "and publishes nothing, not everything");
  check(showcaseIds().length === 0, "and names nothing");
  check(showcaseStore() === null, "and names no store");

  process.env.SHOWCASE_RUNS = "  ,, ";
  check((await showcasePages()).length === 0, "a list of separators is still nothing");

  process.env.SHOWCASE_STORE = "not-a-domain";
  check(showcaseStore() === null, "a store name with no dot in it is not a domain");
  check((await showcasePages()).length === 0, "and publishes nothing");

  console.log("\none store's Library, which is the default source");

  process.env.SHOWCASE_RUNS = "";
  {
    process.env.SHOWCASE_STORE = storeWithRuns;
    check(showcaseSource() === "store", "naming a store selects the store source");
    const fromStore = await showcasePages();
    check(fromStore.length > 0, `${storeWithRuns} publishes its pages`, `${fromStore.length} pages`);
    check(
      fromStore.every((p) => p.design?.tree),
      "every one of them has a tree",
    );
    /* The cap. A store with thirty runs must not put every page it has ever
       built on the front door — each is about 22KB of design tree. */
    check(fromStore.length <= 12, "and never more than twelve", `${fromStore.length}`);

    process.env.SHOWCASE_STORE = "nobody.myshopify.com";
    check(
      (await showcasePages()).length === 0,
      "a store with no runs here publishes nothing, and does not throw",
    );
  }

  /* THE COMPILED-IN DEFAULT, which is what production actually runs — no env
     var at all. This is the case that was broken twice: a value that lived only
     in `.env.local` deployed as nothing. Asserting the default publishes pages
     here is the only check that would have caught it before the push. */
  delete process.env.SHOWCASE_RUNS;
  delete process.env.SHOWCASE_STORE;
  const builtin = showcaseStore();
  check(builtin !== null, "with no env set at all, a store is still named", builtin);
  check(showcaseSource() === "store", "and the source is that store");
  /* ==========================================================================
     TWO CLAIMS WERE BEING MADE BY ONE ASSERTION, and only one of them is about
     this code.

     "The compiled-in default names a store" is a property of the source and is
     checked above — it is the one that deployed as nothing, twice. "That store
     has pages IN THIS DATABASE" is a fact about whichever machine is running
     the test, and it held until now only because the default happened to be
     the laptop's own dev store. Pointing it at a real one made the same
     assertion fail on every developer's machine, which is how a test starts
     being ignored.

     So the data half reports rather than fails — and loudly, because it is
     still the thing that goes wrong. On a machine that HAS runs for the store
     it stays a real assertion, including the twenty-page floor the skip
     introduced.
     ========================================================================== */
  const byDefault = await showcasePages();
  const runsHere = (await getRepo().listRuns(builtin ?? "").catch(() => [])).length;

  if (runsHere === 0) {
    console.log(
      `  · ${builtin} has no runs on this machine, so the marquee is empty here.` +
        ` That is local. Check /api/health on the deployment for the number` +
        ` that matters.`,
    );
  } else {
    check(
      byDefault.length > 0,
      `the built-in store publishes pages here`,
      `${builtin} → ${byDefault.length} pages from ${runsHere} runs` +
        ` (nineteen newest skipped — a store under twenty pages shows nothing)`,
    );
  }

  /* Named runs are more specific than a named store, so they win. Without this
     ordering, setting SHOWCASE_RUNS to fix a bad marquee would do nothing. */
  process.env.SHOWCASE_STORE = storeWithRuns;
  process.env.SHOWCASE_RUNS = ids[0];
  check(showcaseSource() === "runs", "a named run wins over a named store");

  const [first, second] = ids;
  process.env.SHOWCASE_RUNS = first;
  const one = await showcasePages();
  check(one.length > 0, "a named run publishes its pages", `${one.length} pages`);

  if (second && second !== first) {
    const notNamed = await showcasePages();
    check(
      notNamed.every((p) => p.id !== undefined),
      "and a run that exists but was not named contributes none of them",
    );
  }

  console.log("\nwhat leaves, and what does not");

  const page = one[0] as unknown as Record<string, unknown>;
  for (const field of ["domain", "prompt", "whatYouSell", "brief", "payload", "email"])
    check(!(field in page), `no ${field} on a public page`);

  check("tokens" in page, "the palette comes out — a card cannot draw without it");
  check("design" in page, "and the tree, which is the page itself");
  check("label" in page && "categoryLabel" in page, "and the two labels a card shows");

  console.log("\nthe stale-list case, which is how this broke on production twice");

  {
    process.env.SHOWCASE_STORE = storeWithRuns;
    process.env.SHOWCASE_RUNS = "from-another-database,and-another";
    const rescued = await showcasePages();
    check(
      rescued.length > 0,
      "a list where NO id resolves falls back to the named store",
      `${rescued.length} pages`,
    );

    /* One bad id must NOT trigger the fallback — the ids that resolve are still
       what was asked for. Compared by page id rather than by count: a store and
       a run can happen to hold the same NUMBER of pages, and then a count test
       passes while the fallback is silently firing. */
    process.env.SHOWCASE_RUNS = ids[0];
    const justGood = (await showcasePages()).map((p) => p.id).join(",");
    process.env.SHOWCASE_RUNS = `from-another-database,${ids[0]}`;
    const partial = (await showcasePages()).map((p) => p.id).join(",");
    check(
      partial === justGood && partial.length > 0,
      "while one bad id among good ones publishes exactly the good ones",
      `${partial.split(",").length} pages, the named run's own`,
    );
  }

  console.log("\nfailure");

  /* Store source off, or "a deleted run publishes nothing" would be satisfied
     by the store fallback rather than by the skip it is testing. */
  process.env.SHOWCASE_STORE = "";
  process.env.SHOWCASE_RUNS = "no-such-run-at-all";
  check((await showcasePages()).length === 0, "a deleted run is skipped, not thrown");

  process.env.SHOWCASE_RUNS = `no-such-run-at-all,${first}`;
  const mixed = await showcasePages();
  check(mixed.length > 0, "and the runs beside it still come through", `${mixed.length} pages`);

  process.env.SHOWCASE_RUNS = first;
  const all = await showcasePages();
  check(
    all.every((p) => p.design?.tree),
    "every published page has a tree — an empty card is worse than one fewer",
  );

  console.log(`\n${failures === 0 ? "PASS" : `${failures} FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
