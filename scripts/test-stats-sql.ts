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
import type { GeoFilter } from "../lib/db/types";
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
  { name: "one country", q: { only: ["VN"] } },
  { name: "all time, one country", q: { days: 0, only: ["VN"] } },
  { name: "day and two countries", q: { day: "2026-09-22", only: ["US", "VN"] } },
  { name: "a country excluded", q: { days: 7, except: ["VN"] } },
  { name: "some in, some out", q: { days: 30, only: ["VN"], except: ["US"] } },
  { name: "the unplaced bucket", q: { days: 7, only: ["unknown"] } },
  { name: "everything placed", q: { days: 7, except: ["unknown"] } },
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
    only: ["VN"],
  });
  const flat = asked.flatMap((a) => a.values);
  ok("the day is a bound value", flat.includes("2026-09-22"), JSON.stringify(flat));
  ok(
    "so is the country, as an array",
    flat.some((v) => Array.isArray(v) && v.includes("VN")),
    JSON.stringify(flat),
  );
  ok(
    "AND NEITHER IS SPLICED INTO THE TEXT",
    !asked.some((a) => a.text.includes("2026-09-22") || a.text.includes("'VN'")),
    "a filter concatenated into SQL is the other way this goes wrong",
  );

  /* ==========================================================================
     AND THE SAME CHECK ON `sumEventProp`, WHICH IS THE SECOND PLACE IN THIS
     FILE THAT HANDS OUT ITS OWN SLOTS.

     It allocates from a counter, then asks `geoClause` to number its
     placeholders from the next free one — so anything allocated AFTER that
     call silently takes a number the geo clause has already claimed. The first
     draft did exactly that with the event name, and under a country filter it
     sent six values for a statement whose highest slot was five: the identical
     shape of the outage at the top of this file, in a method written years
     after it.

     The group keys vary the count, which is the point — one key and two keys
     put `geoClause` at different starting numbers, and a bug that only shows at
     one of them is a bug that ships.
     ========================================================================== */
  const SUM_SHAPES: { name: string; keys: string[]; geo: GeoFilter }[] = [
    { name: "two keys, no filter", keys: ["set", "page_type"], geo: null },
    { name: "one key, no filter", keys: ["set"], geo: null },
    { name: "no keys at all", keys: [], geo: null },
    { name: "two keys, one country", keys: ["set", "page_type"], geo: { only: ["VN"] } },
    { name: "one key, one country", keys: ["set"], geo: { only: ["VN"] } },
    { name: "no keys, one country", keys: [], geo: { only: ["VN"] } },
    { name: "two keys, a country out", keys: ["set", "page_type"], geo: { except: ["VN"] } },
    { name: "one key, the unplaced", keys: ["set"], geo: { only: ["unknown"] } },
    { name: "two keys, in and out", keys: ["set", "page_type"], geo: { only: ["VN"], except: ["US"] } },
  ];

  for (const shape of SUM_SHAPES) {
    head(`sumEventProp — ${shape.name}`);
    const rec = recorder();
    const repo = createPostgresRepo("postgres://unused/x", rec.pool);

    try {
      await repo.sumEventProp(
        "design_showcase_page_viewed",
        shape.keys,
        "seconds",
        "2026-09-01T00:00:00.000Z",
        "2026-09-25T00:00:00.000Z",
        shape.geo,
      );
    } catch (err) {
      ok("sumEventProp() completed", false, (err as Error)?.message);
      continue;
    }

    ok("it issued one statement", rec.asked.length === 1, `${rec.asked.length}`);
    for (const a of rec.asked) {
      const { max, used } = placeholders(a.text);
      ok(
        "the statement matches its own parameter list",
        max === a.values.length,
        `$${max} is the highest slot but ${a.values.length} value(s) were sent`,
      );
      let gapped = 0;
      for (let i = 1; i <= max; i++) if (!used.has(i)) gapped++;
      ok("and it skips no slot", gapped === 0);

      /* A key spliced into the text instead of bound would work and would be an
         injection the moment a key comes off a query string. */
      ok(
        "the group keys are bound, not spliced",
        shape.keys.every((k) => a.values.includes(k)) &&
          !shape.keys.some((k) => a.text.includes(`'${k}'`)),
        JSON.stringify(a.values),
      );
      ok(
        "and it groups by as many columns as it was given keys",
        (a.text.match(/group by ([^\n]*)/)?.[1]?.split(",").length ?? 0) === shape.keys.length,
        a.text.match(/group by ([^\n]*)/)?.[1] ?? "no group by",
      );
    }
  }

  console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
  process.exit(bad === 0 ? 0 : 1);
}

void main();
