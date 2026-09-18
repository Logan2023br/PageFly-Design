/* ==========================================================================
   The brief a stored run was built from, back out as a file.

       DOMAIN=mxhxua-6i.myshopify.com npx tsx scripts/replay-run.ts
       DOMAIN=… RUN=<id> OUT=/tmp/brief.json npx tsx scripts/replay-run.ts

   RUN THIS ON THE SERVER, for the same reason `dump-runs.ts` says so: it reads
   whatever `getRepo()` resolves to, which is Postgres wherever DATABASE_URL is
   set and the file store otherwise — so on a laptop it answers about the
   laptop.

   WHY IT EXISTS. `runs.payload` holds the brief and nothing else holds it, so
   the one input a finished build kept is locked inside an encoded column. That
   matters because the two questions worth asking about a build — what Opus
   planned, and whether DeepSeek built it — need the run to happen again with
   `trace-build.ts` listening, and that script takes a brief file.

   So this is the join between the two: it reads the run somebody is asking
   about, decodes the brief they actually submitted, and writes it in the shape
   the tracer expects.

       DOMAIN=… npx tsx scripts/replay-run.ts          → /tmp/brief.json
       BRIEF=/tmp/brief.json OUT=/tmp/trace.json \
         npx tsx scripts/trace-build.ts                → every byte both models saw

   WHAT IT CANNOT PROMISE. The same brief, not the same page. Both models are
   non-deterministic and the skills have changed since, so the replay answers
   "what does this brief produce now" — which is the useful question — and not
   "what did that exact build do", which nothing can answer any more.

   Reads only. Nothing is written to the database.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { writeFileSync } from "node:fs";

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
const RUN = process.env.RUN;
const OUT = process.env.OUT ?? "/tmp/brief.json";

async function main(): Promise<void> {
  if (!DOMAIN && !RUN) {
    console.error("Set DOMAIN, e.g. DOMAIN=mxhxua-6i.myshopify.com — or RUN=<id>.");
    process.exitCode = 1;
    return;
  }

  const { getRepo } = await import("../lib/db");
  const { decodeRunPayload } = await import("../lib/runPayload");
  const repo = getRepo();

  console.log(
    `database: ${process.env.DATABASE_URL ? "postgres" : "file store (NOT the server's)"}`,
  );

  /* By id when one is named, because a store with thirty runs has thirty
     briefs and "the newest" is rarely the one being asked about. */
  const run = RUN
    ? await repo.getRun(RUN)
    : (await repo.listRuns(DOMAIN!)).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )[0];

  if (!run) {
    console.error(RUN ? `No run ${RUN}.` : `No runs for ${DOMAIN}.`);
    process.exitCode = 1;
    return;
  }

  const decoded = decodeRunPayload(run.payload);
  if (!decoded.ok) {
    console.error(`Run ${run.id}: ${decoded.reason}`);
    process.exitCode = 1;
    return;
  }

  const { brief } = decoded.payload;
  writeFileSync(OUT, JSON.stringify(brief, null, 2));

  console.log(`\nrun      ${run.id}`);
  console.log(`store    ${run.domain}`);
  console.log(`built    ${run.createdAt}`);
  console.log(`pages    ${run.pageCount} · ${run.tokens.toLocaleString()} tokens`);
  console.log(`style    ${run.styleLabel || "—"}`);
  console.log(`snapshot ${run.snapshot ? "present" : "NULL — the pages were never stored"}`);

  /* The fields somebody comparing a replay against the original will want to
     see agree, printed rather than left in the file. */
  const b = brief as Record<string, unknown>;
  console.log(`\nbrief → ${OUT}`);
  for (const key of ["whatYouSell", "storeType", "visualStyle", "market", "verticalSlug"]) {
    const v = b[key];
    if (v !== undefined && v !== null && v !== "")
      console.log(`  ${key.padEnd(14)} ${String(v).slice(0, 72)}`);
  }
  const prompt = typeof b.prompt === "string" ? b.prompt : "";
  if (prompt)
    console.log(
      `  ${"prompt".padEnd(14)} ${prompt.length.toLocaleString()} chars · ${prompt.split("\n").length} lines`,
    );
  const pages = b.pages as Record<string, number> | undefined;
  if (pages)
    console.log(
      `  ${"pages".padEnd(14)} ${Object.entries(pages).map(([k, n]) => `${k}×${n}`).join(" ")}`,
    );

  console.log(`\nnext:\n  BRIEF=${OUT} OUT=/tmp/trace.json npx tsx scripts/trace-build.ts`);
  console.log(
    `\nThat costs one real page build. It replays THIS brief through today's\n` +
      `pipeline — the same input, not the same page: both models are\n` +
      `non-deterministic and the skills have changed since.`,
  );
}

void main();

export {};
