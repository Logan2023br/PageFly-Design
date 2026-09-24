/* ==========================================================================
   EVERY STATEMENT AGAINST ITS OWN PARAMETER LIST.

       npx tsx scripts/test-stats-sql.ts

   THIS TEST EXISTS BECAUSE OF AN OUTAGE. `stats()` built one shared `params`
   array and handed it to all seven statements behind the admin screen. Six of
   them contain no `$1` at all when no filter is picked, and postgres refuses
   the whole statement for that:

       bind message supplies 1 parameters, but prepared statement requires 0

   The screen returned 500 for everyone. It shipped because there is no
   Postgres on the machine this was written on, and every other check — types,
   lint, build, the memory driver's own tests — passed: a parameter list that
   does not match its statement is not a type error, and the memory driver has
   no parameters at all.

   SO THE STATEMENTS ARE READ RATHER THAN RUN. A recorder stands in for the
   pool, `stats()` is called once for every shape of filter, and each statement
   is checked against the list it was given. No database, and it would have
   caught the outage before the push.
   ========================================================================== */

import type { Pool } from "pg";
import { createPostgresRepo } from "../lib/db/postgresRepo";

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);

type Asked = { text: string; values: unknown[] };

function recorder(): { pool: Pool; asked: Asked[] } {
  const asked: Asked[] = [];
  const pool = {
    query: async (text: string, values?: unknown[]) => {
      /* The DDL is one statement per table, run through the same door. It has
         no parameters and is not part of what this measures. */
      if (!/^\s*(create|alter|--|\/\*)/i.test(text)) asked.push({ text, values: values ?? [] });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  return { pool, asked };
}

/** Highest `$n` the text refers to, and every distinct index it uses. */
function placeholders(text: string): { max: number; used: Set<number> } {
  const used = new Set<number>();
  let max = 0;
  for (const m of text.matchAll(/\$(\d+)/g)) {
    const i = Number(m[1]);
    used.add(i);
    if (i > max) max = i;
  }
  return { max, used };
}

const SHAPES: { name: string; q: Parameters<ReturnType<typeof createPostgresRepo>["stats"]>[0] }[] = [
  { name: "no filter (days 30)", q: {} },
  { name: "all time", q: { days: 0 } },
  { name: "seven days", q: { days: 7 } },
  { name: "one day", q: { day: "2026-09-22" } },
  { name: "one country", q: { country: "VN" } },
  { name: "all time, one country", q: { days: 0, country: "VN" } },
  { name: "day and country", q: { day: "2026-09-22", country: "US" } },
  { name: "the unplaced bucket", q: { days: 7, country: "unknown" } },
];

async function main(): Promise<void> {
  for (const shape of SHAPES) {
    head(shape.name);
    const { pool, asked } = recorder();
    const repo = createPostgresRepo("postgres://unused/x", pool);

    try {
      await repo.stats(shape.q);
    } catch (err) {
      ok("stats() completed", false, (err as Error)?.message);
      continue;
    }

    ok("it issued the seven statements", asked.length === 7, `${asked.length}`);

    let mismatched = 0;
    let gapped = 0;
    for (const a of asked) {
      const { max, used } = placeholders(a.text);

      /* THE WHOLE POINT. More values than slots is the outage; fewer is a
         statement referring to something that was never sent. */
      if (max !== a.values.length) {
        mismatched++;
        console.log(
          `    ✗ $${max} is the highest slot but ${a.values.length} value(s) were sent\n` +
            `      ${a.text.trim().split("\n")[0].slice(0, 96)}…`,
        );
      }
      /* $1, $3 with no $2 binds the wrong value to the wrong slot. */
      for (let i = 1; i <= max; i++) if (!used.has(i)) gapped++;
    }
    ok("every statement matches its own parameter list", mismatched === 0);
    ok("and no statement skips a slot", gapped === 0);
  }

  /* ---- and the values that are sent are the ones asked for --------------- */
  head("the filters reach the wire as values, not as text");
  const { pool, asked } = recorder();
  await createPostgresRepo("postgres://unused/x", pool).stats({
    day: "2026-09-22",
    country: "VN",
  });
  const flat = asked.flatMap((a) => a.values);
  ok("the day is a bound value", flat.includes("2026-09-22"), JSON.stringify(flat));
  ok("so is the country", flat.includes("VN"));
  ok(
    "AND NEITHER IS SPLICED INTO THE TEXT",
    !asked.some((a) => a.text.includes("2026-09-22") || a.text.includes("'VN'")),
    "a filter concatenated into SQL is the other way this goes wrong",
  );

  console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
  process.exit(bad === 0 ? 0 : 1);
}

void main();
