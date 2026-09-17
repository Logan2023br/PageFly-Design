/* ==========================================================================
   What the database actually holds for one store.

       DOMAIN=collectionpages.myshopify.com npx tsx scripts/dump-runs.ts

   RUN THIS ON THE SERVER. It reads whatever `getRepo()` resolves to, which is
   Postgres wherever DATABASE_URL is set and the file store otherwise — so on a
   laptop it answers about the laptop, which is the mistake that made this
   script necessary.

   Reads only. It prints the shape of every run and page: how many sections
   each page carries, whether its design tree survived, and which element types
   it holds. That is enough to tell "the build stored nothing" from "the build
   stored a page and the export lost it", which are different bugs with
   different fixes.
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
} as never;

const DOMAIN = process.env.DOMAIN;

function countTypes(value: unknown, into: Record<string, number>): void {
  if (Array.isArray(value)) return value.forEach((v) => countTypes(v, into));
  if (!value || typeof value !== "object") return;
  const o = value as Record<string, unknown>;
  if (typeof o.type === "string") into[o.type] = (into[o.type] ?? 0) + 1;
  for (const v of Object.values(o)) countTypes(v, into);
}

async function main(): Promise<void> {
  if (!DOMAIN) {
    console.error("Set DOMAIN, e.g. DOMAIN=collectionpages.myshopify.com");
    process.exitCode = 1;
    return;
  }

  const { getRepo } = await import("../lib/db");
  console.log(`database: ${process.env.DATABASE_URL ? "postgres" : "file store (NOT the server's)"}`);
  console.log(`domain:   ${DOMAIN}\n`);

  const runs = await getRepo().listRuns(DOMAIN);
  console.log(`${runs.length} run(s)\n`);

  for (const run of runs) {
    console.log(`── run ${run.id} · ${run.createdAt} · ${run.pageCount} pages · ${run.tokens} tokens`);
    console.log(`   snapshot: ${run.snapshot ? "present" : "NULL — the pages were never stored"}`);

    /* THE TREE IS IN THE SNAPSHOT, not in `run_pages`. `RunPageRecord` carries
       five metadata fields and nothing else — runId, pageId, pageType, label,
       index — and the pages "exactly as they were built" live in `snapshot`.
       Reading the wrong one reports NO DESIGN TREE on a run that has one,
       which is how this script first answered. */
    const stored = Array.isArray(run.snapshot) ? (run.snapshot as unknown[]) : [];
    if (stored.length === 0 && run.pages.length > 0)
      console.log(`   (${run.pages.length} page rows, but no snapshot to read them from)`);

    for (const page of stored) {
      const p = page as {
        pageType?: string;
        label?: string;
        design?: { tree?: { sections?: unknown[] }; images?: object };
      };
      const sections = p.design?.tree?.sections;
      if (!sections) {
        console.log(`   · ${(p.pageType ?? "?").padEnd(14)} NO DESIGN TREE`);
        continue;
      }
      const types: Record<string, number> = {};
      countTypes(sections, types);
      const top = Object.entries(types)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, n]) => `${k}×${n}`)
        .join(" ");
      console.log(
        `   · ${(p.pageType ?? "?").padEnd(14)} ${String(sections.length).padStart(2)} sections · ` +
          `${Object.keys(p.design?.images ?? {}).length} images`,
      );
      console.log(`     ${top}`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

export {};
