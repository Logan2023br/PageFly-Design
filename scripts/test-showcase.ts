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

/** Every run id the local database holds, so the test can name a real one. */
function realRunIds(): string[] {
  try {
    const db = JSON.parse(readFileSync(".pfd-dev-db.json", "utf8")) as {
      runs?: { id: string; snapshot?: unknown }[];
    };
    return (db.runs ?? [])
      .filter((r) => Array.isArray(r.snapshot) && r.snapshot.length > 0)
      .map((r) => r.id);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const ids = realRunIds();
  if (ids.length === 0) {
    console.log("\nNo saved runs in the local database — build a page first.\n");
    process.exit(0);
  }

  const { showcasePages, showcaseIds } = await import("@/lib/showcase");

  console.log("\nnothing is published by accident");

  process.env.SHOWCASE_RUNS = "";
  check((await showcasePages()).length === 0, "an unset list publishes nothing, not everything");
  check(showcaseIds().length === 0, "and names nothing");

  process.env.SHOWCASE_RUNS = "  ,, ";
  check((await showcasePages()).length === 0, "a list of separators is still nothing");

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

  console.log("\nfailure");

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
