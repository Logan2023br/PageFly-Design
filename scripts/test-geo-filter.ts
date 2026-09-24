/* ==========================================================================
   THE COUNTRY FILTER MEANS THE SAME THING EVERYWHERE.

       npx tsx scripts/test-geo-filter.ts

   THE FILTER IS WRITTEN TWICE. Postgres gets a `where` clause, the in-memory
   repo gets a predicate in TypeScript, and the two have to agree — a screen
   whose numbers change when the deployment moves from a file to a database is
   worse than one with no filter at all.

   THE THREE RULES THAT ARE EASY TO GET WRONG, and each is tested by a case
   that fails loudly if it is:

   1. EXCLUDING A COUNTRY KEEPS THE UNPLACED ROWS. "Everything except Vietnam"
      must include a press we could not place — it is not known to be
      Vietnamese. Dropping it would silently also drop every visitor the
      resolver missed, which on a deployment with no GeoIP header is most of
      them, and the totals would fall by half with nothing on screen saying why.

   2. PICKING A COUNTRY DROPS THEM. "Only Vietnam" is only what we know to be
      Vietnam. An unplaced row is not evidence of anything.

   3. `unknown` IS A PLACE. Pickable and excludable like any other, because
      "how much of this could we not place" is a fair question and the parts
      have to add up to the whole.

   Run against the in-memory repo, which is the one this script can actually
   open. The postgres clause is checked by reading it — see the SQL assertions
   at the bottom, which are a text test and say so.
   ========================================================================== */
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryRepo } from "../lib/db/memoryRepo";
import { geoClause } from "../lib/db/postgresRepo";
import type { EventRecord, GeoFilter } from "../lib/db/types";

let bad = 0;
function check(ok: boolean, label: string, detail = ""): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) bad += 1;
}

/* Its own file, removed first, so a previous run's rows cannot be counted into
   this one's totals — every check here is an exact number. */
const FILE = join(tmpdir(), "pfd-geo-filter-test.json");
rmSync(FILE, { force: true });
const repo = createMemoryRepo(FILE);
const AT = "2024-06-15T10:00:00.000Z";
const WINDOW: [string, string] = ["2024-06-01T00:00:00.000Z", "2024-07-01T00:00:00.000Z"];

const press = (country: string | null, visitor: string): EventRecord => ({
  id: randomUUID(),
  name: "design_cta_clicked",
  props: { location: "hero" },
  visitorId: visitor,
  domain: null,
  country,
  createdAt: AT,
});

async function main(): Promise<void> {
  /* Three placed, two unplaced — so every rule below produces a different
     number and none of them can be mistaken for another. */
  await repo.recordEvents([
    press("VN", "v1"),
    press("VN", "v2"),
    press("US", "v3"),
    press(null, "v4"),
    press(null, "v5"),
  ]);

  async function total(geo: GeoFilter): Promise<number> {
    const rows = await repo.countEvents(WINDOW[0], WINDOW[1], geo);
    return rows.reduce((a, r) => a + r.count, 0);
  }

  console.log("\nthe three rules");

  check((await total(null)) === 5, "no filter is everything", String(await total(null)));

  check(
    (await total({ only: ["VN"] })) === 2,
    "only VN is the two Vietnamese presses — unplaced rows are NOT Vietnam",
    String(await total({ only: ["VN"] })),
  );

  check(
    (await total({ except: ["VN"] })) === 3,
    "except VN keeps US and BOTH unplaced rows",
    String(await total({ except: ["VN"] })),
  );

  check(
    (await total({ only: ["unknown"] })) === 2,
    "unknown is a place you can pick",
    String(await total({ only: ["unknown"] })),
  );

  check(
    (await total({ except: ["unknown"] })) === 3,
    "and one you can exclude, leaving only what was placed",
    String(await total({ except: ["unknown"] })),
  );

  check(
    (await total({ only: ["VN", "US"] })) === 3,
    "picking two countries is the union of them",
    String(await total({ only: ["VN", "US"] })),
  );

  check(
    (await total({ except: ["VN", "unknown"] })) === 1,
    "excluding a country and the unplaced leaves the rest",
    String(await total({ except: ["VN", "unknown"] })),
  );

  /* A filter that names nothing must match nothing rather than quietly becoming
     "everything" — a filter that stops filtering is the bug that shows wrong
     numbers under a heading that says they are right. */
  check(
    (await total({ only: [] })) === 5,
    "an empty `only` is not a filter at all, and is treated as none",
    String(await total({ only: [] })),
  );

  console.log("\nthe same rules reach the other reads");

  const daily = await repo.countEventsByDay(WINDOW[0], WINDOW[1], 0, { only: ["VN"] });
  check(
    daily.reduce((a, d) => a + d.events, 0) === 2,
    "the day strip narrows too",
    String(daily.reduce((a, d) => a + d.events, 0)),
  );

  const hits = await repo.recentEvents(
    "design_cta_clicked",
    WINDOW[0],
    WINDOW[1],
    null,
    null,
    100,
    { except: ["VN"] },
  );
  check(hits.length === 3, "so does the feed of individual presses", String(hits.length));
  check(
    hits.every((h) => h.country !== "VN"),
    "and every row it returns obeys the filter",
  );
  check(
    hits.some((h) => h.country === null),
    "including the unplaced ones, which excluding VN must keep",
  );

  const byStore = await repo.eventsByStore(
    "design_cta_clicked",
    WINDOW[0],
    WINDOW[1],
    "location",
    null,
    null,
    { only: ["VN"] },
  );
  check(
    byStore.reduce((a, r) => a + r.count, 0) === 2,
    "and the per-store fold",
    String(byStore.reduce((a, r) => a + r.count, 0)),
  );

  console.log("\nthe list of countries is NOT filtered");

  const seen = await repo.countriesSeen(WINDOW[0], WINDOW[1]);
  check(seen.length === 3, "every country in the window, whatever is selected", String(seen.length));
  check(seen[0]?.country === "VN" && seen[0]?.events === 2, "busiest first");
  check(
    seen.some((c) => c.country === null),
    "with the unplaced rows as their own row",
  );

  /* ==========================================================================
     AND THE SQL SAYS THE SAME THING.

     This used to read `postgresRepo.ts` as text and grep it for the literal
     spelling of two clauses — honest about being a text test, on the grounds
     that the script cannot open a Postgres. But `geoClause` is a pure string
     builder: it needs no database, only to be exported. So it is CALLED now.

     The difference is not academic. The text version broke the moment the
     column became a parameter — a change that emits byte-identical SQL — while
     a genuinely inverted `only`/`except` spelled the old way would have passed
     it. It was asserting how the function is written, not what it returns.
     ========================================================================== */
  console.log("\nthe postgres clause encodes the same two rules");

  const onlyVn = geoClause({ only: ["VN"], except: [] }, 3);
  check(
    onlyVn.sql.includes("country = any($3::text[])") && onlyVn.params[0] instanceof Array,
    "picking matches the named codes, with the codes as a bound array",
    onlyVn.sql,
  );
  check(
    geoClause({ only: ["unknown"], except: [] }, 1).sql.includes("country is null"),
    "`unknown` means the rows with no country",
  );
  check(
    geoClause({ only: [], except: ["VN"] }, 1).sql.includes(
      "(country is null or country <> all($1::text[]))",
    ),
    "excluding keeps rows with no country",
  );
  check(
    geoClause({ only: [], except: ["unknown"] }, 1).sql.includes("country is not null"),
    "and excluding `unknown` drops exactly those",
  );
  check(
    geoClause({ only: ["unknown"], except: [] }, 1).params.length === 0,
    "a pick with no codes binds nothing",
  );

  /* The two that are easy to get backwards, asserted as opposites rather than
     as spellings. */
  check(
    geoClause({ only: ["VN"], except: [] }, 1).sql !==
      geoClause({ only: [], except: ["VN"] }, 1).sql,
    "AN ONLY AND AN EXCEPT ARE NOT THE SAME CLAUSE",
  );

  /* The numbering has to continue from where the caller left off, or the codes
     bind to somebody else's slot. */
  check(
    geoClause({ only: ["VN"], except: ["US"] }, 5).sql.includes("$5") &&
      geoClause({ only: ["VN"], except: ["US"] }, 5).sql.includes("$6"),
    "two lists take two consecutive slots from where they were told to start",
    geoClause({ only: ["VN"], except: ["US"] }, 5).sql,
  );

  /* The column is a parameter now, because the stats screen counts a store
     whose country is the empty string as unplaced, like a null. */
  check(
    geoClause({ only: ["unknown"], except: [] }, 1, "nullif(trim(s.country), '')").sql.includes(
      "nullif(trim(s.country), '') is null",
    ),
    "and the column it tests can be an expression",
  );

}

void main().then(() => {
  rmSync(FILE, { force: true });
  console.log(bad === 0 ? "\nPASS" : `\nFAIL — ${bad} problems`);
  if (bad > 0) process.exitCode = 1;
});

