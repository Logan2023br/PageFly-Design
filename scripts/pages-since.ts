/* ==========================================================================
   HOW MANY PAGES WERE BUILT IN A WINDOW.

       FROM=2025-10-01 npx tsx scripts/pages-since.ts
       FROM=2025-10-01 TO=2026-01-01 npx tsx scripts/pages-since.ts

   RUN THIS ON THE SERVER. It reads whatever DATABASE_URL points at; on a
   laptop with no database configured it refuses rather than answering about
   the file store, which would be a confident number about nothing.

   Reads only. No writes, no model calls, no cost.

   TWO NUMBERS, NOT ONE, and the gap between them is the point. `runs.page_count`
   is what a build CLAIMED; the rows in `run_pages` are the pages it actually
   recorded. They are supposed to agree. A test in this repo exists because they
   once did not — a fixture saved the count with no rows behind it and the
   proof feed read zero — so a report that prints only one of them can be wrong
   in a direction nobody notices. When they disagree, the row count is the one
   to believe: it is the thing a merchant's allowance is charged against.
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

const FROM = process.env.FROM ?? "2025-10-01";
const TO = process.env.TO ?? new Date().toISOString().slice(0, 10);

async function main(): Promise<void> {
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    console.error(
      "No DATABASE_URL in this environment.\n" +
        "Run this on the server. A laptop with no database configured would be\n" +
        "answering about its own file store, which is not the question.",
    );
    process.exit(2);
  }

  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 1 });
  const q = async (text: string) => (await pool.query(text, [FROM, TO])).rows[0] ?? {};

  /* COUNTED SEPARATELY, ON PURPOSE. Joining `run_pages` to `runs` and summing
     `page_count` in the same query multiplies the claim by the number of page
     rows — the classic fan-out, and it inflates rather than errors. */
  const recorded = await q(`
    select count(p.page_id) as pages, count(distinct r.domain) as stores
    from runs r
    join run_pages p on p.run_id = r.id
    where r.created_at >= $1::date and r.created_at < ($2::date + interval '1 day')
  `);
  const claimed = await q(`
    select coalesce(sum(page_count), 0) as pages, count(*) as runs,
           count(distinct domain) as stores
    from runs
    where created_at >= $1::date and created_at < ($2::date + interval '1 day')
  `);
  const months = (
    await pool.query(
      `select to_char(date_trunc('month', r.created_at), 'YYYY-MM') as month,
              count(p.page_id) as pages,
              count(distinct r.id) as runs,
              count(distinct r.domain) as stores
       from runs r
       left join run_pages p on p.run_id = r.id
       where r.created_at >= $1::date and r.created_at < ($2::date + interval '1 day')
       group by 1 order by 1`,
      [FROM, TO],
    )
  ).rows;

  console.log(`\n${FROM} → ${TO}\n`);
  console.log(`  pages recorded   ${recorded.pages}   (rows in run_pages)`);
  console.log(`  pages claimed    ${claimed.pages}   (sum of runs.page_count)`);
  console.log(`  runs             ${claimed.runs}`);
  console.log(`  stores           ${claimed.stores}`);

  const gap = Number(claimed.pages) - Number(recorded.pages);
  if (gap !== 0)
    console.log(
      `\n  ! the two disagree by ${gap}.` +
        `\n    Believe the recorded count: a run that claimed pages with no rows behind` +
        `\n    it delivered nothing, and that is what an allowance is charged against.`,
    );

  console.log("\n  month      pages   runs  stores");
  for (const m of months)
    console.log(
      `  ${m.month}   ${String(m.pages).padStart(5)}  ${String(m.runs).padStart(5)}  ${String(m.stores).padStart(6)}`,
    );
  console.log();
  await pool.end();
}

void main();
