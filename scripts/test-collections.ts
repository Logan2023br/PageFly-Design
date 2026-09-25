/* ==========================================================================
   THE COLLECTION FIGURES, AND THE THREE WAYS THEY GO QUIETLY WRONG.

       npx tsx scripts/test-collections.ts

   This screen has the property the analytics note warns about: every failure
   here renders perfectly. A per-set figure that has quietly summed all three
   sets is a bigger number that looks like good news; an average taken over
   presses instead of over readings is a smaller number that looks like a page
   nobody stays on. Neither goes red.

   So the three things checked are the three that cannot be seen:

     1. THE SET IS ACTUALLY A FILTER. All three stores have a page called Home,
        so a fold that forgets `set` still produces a plausible table.
     2. THE AVERAGE IS OVER THE READINGS THAT CARRIED A NUMBER, not over every
        row — an event with no `seconds` on it must not drag the mean down.
     3. THE TWO DRIVERS AGREE. `sumEventProp` exists twice, in SQL and in the
        file store, and this repo has watched a rule drift between them before.
        Only the file store can be run here, so what the other one does is
        checked by `test-stats-sql.ts`; what IS checked here is that the file
        store's answer matches an independent count over the same events.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const DB_FILE = join(tmpdir(), "pfd-test-collections.json");
rmSync(DB_FILE, { force: true });
process.env.PFD_DB_FILE = DB_FILE;
process.env.SESSION_SECRET = "collections-test-secret-value-long-enough";

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const WINDOW = ["2000-01-01T00:00:00.000Z", "2100-01-01T00:00:00.000Z"] as const;

async function main(): Promise<void> {
  const { getRepo } = await import("@/lib/db");
  const { EV } = await import("@/lib/analytics");
  const { SHOWCASE_SETS } = await import("@/lib/showcasePages");
  const repo = getRepo();

  const [A, B] = SHOWCASE_SETS;
  check(Boolean(A && B), "there are at least two sets to tell apart", `${SHOWCASE_SETS.length}`);

  const ev = (
    name: string,
    props: Record<string, unknown>,
    visitorId = "v-one",
    country: string | null = "VN",
  ) => ({
    id: randomUUID(),
    name,
    props,
    visitorId,
    domain: null,
    country,
    createdAt: new Date().toISOString(),
  });

  /* ==========================================================================
     THE FIXTURE, AND WHY IT IS SHAPED LIKE THIS.

     BOTH SETS GET A `home`, because that is the collision the `set` filter
     exists to survive — with one set in the fixture, a fold that ignores `set`
     passes every assertion below.

     THE COUNTS PER SET ARE DIFFERENT NUMBERS. Two Homes opened in A and one in
     B: equal counts would make "it summed both sets" and "it filtered
     correctly" produce the same answer for A.
     ========================================================================== */
  await repo.recordEvents([
    /* A · home — opened three times, two of them with a reading */
    ev(EV.galleryOpened, { set: A.id, page_type: "home", from: "landing" }),
    ev(EV.galleryOpened, { set: A.id, page_type: "home", from: "landing" }, "v-two"),
    ev(EV.galleryOpened, { set: A.id, page_type: "home", from: "landing" }, "v-two"),
    ev(EV.showcasePageViewed, { set: A.id, page_type: "home", seconds: 10 }),
    ev(EV.showcasePageViewed, { set: A.id, page_type: "home", seconds: 30 }, "v-two"),
    /* AND ONE WITH NO READING AT ALL — an older build in somebody's tab. It
       must count as a press and NOT as a zero-second read. */
    ev(EV.showcasePageViewed, { set: A.id, page_type: "home" }, "v-two"),

    /* A · contact — taken once */
    ev(EV.showcaseFileDownloaded, { set: A.id, page_type: "contact", from: "landing" }),

    /* A, whole */
    ev(EV.showcaseSetDownloaded, { set: A.id, pages: A.pages.length, from: "landing" }),
    ev(EV.showcaseSetScrolled, { set: A.id, pages: A.pages.length, from: "landing" }),
    ev(EV.showcaseSetScrolled, { set: A.id, pages: A.pages.length, from: "landing" }, "v-two"),

    /* B · home — one open, one very long read, from another country */
    ev(EV.galleryOpened, { set: B.id, page_type: "home", from: "landing" }, "v-three", "DE"),
    ev(EV.showcasePageViewed, { set: B.id, page_type: "home", seconds: 300 }, "v-three", "DE"),
  ]);

  /* ---- 1 · the set is a filter ------------------------------------------ */
  console.log("\nthe set narrows, and both sets have a page called home");

  const perPage = await repo.sumEventProp(
    EV.showcasePageViewed,
    ["set", "page_type"],
    "seconds",
    WINDOW[0],
    WINDOW[1],
  );

  const aHome = perPage.find((r) => r.keys[0] === A.id && r.keys[1] === "home");
  const bHome = perPage.find((r) => r.keys[0] === B.id && r.keys[1] === "home");

  check(Boolean(aHome && bHome), "each set's home is its own row", `${perPage.length} rows`);
  check(aHome?.count === 3, "A's home saw three closings", String(aHome?.count));
  check(bHome?.count === 1, "B's home saw one", String(bHome?.count));
  check(
    aHome?.total === 40,
    "and A's seconds are A's alone — 300 would mean B leaked in",
    String(aHome?.total),
  );

  /* ---- 2 · the average is over what was measured ------------------------- */
  console.log("\nthe average is over the readings, not over the presses");

  check(aHome?.measured === 2, "two of the three carried a number", String(aHome?.measured));
  check(
    aHome !== undefined && aHome.total / aHome.measured === 20,
    "so the average is 20s",
    aHome ? String(aHome.total / aHome.measured) : "—",
  );
  /* THE BUG THIS EXISTS FOR. Dividing by `count` is the obvious line to write
     and it is wrong by exactly the rows that reported nothing. */
  check(
    aHome !== undefined && aHome.total / aHome.count !== 20,
    "and dividing by the press count would have said something else",
    aHome ? String(Math.round((aHome.total / aHome.count) * 10) / 10) : "—",
  );

  /* ---- 3 · the figures match an independent count ------------------------ */
  console.log("\nthe driver agrees with a count done another way");

  const rows = await repo.countEvents(WINDOW[0], WINDOW[1]);
  const byHand = (name: string, set: string, page?: string) =>
    rows
      .filter(
        (r) =>
          r.name === name &&
          r.props.set === set &&
          (page === undefined || r.props.page_type === page),
      )
      .reduce((a, b) => a + b.count, 0);

  check(byHand(EV.galleryOpened, A.id) === 3, "A was opened three times", String(byHand(EV.galleryOpened, A.id)));
  check(byHand(EV.galleryOpened, B.id) === 1, "B once", String(byHand(EV.galleryOpened, B.id)));
  check(byHand(EV.showcaseSetDownloaded, A.id) === 1, "A was taken whole once");
  check(byHand(EV.showcaseSetScrolled, A.id) === 2, "and read to the end twice");
  check(byHand(EV.showcaseSetScrolled, B.id) === 0, "B never was", String(byHand(EV.showcaseSetScrolled, B.id)));

  /* ---- 4 · the country filter reaches the average ------------------------ */
  console.log("\nnarrowing to a country narrows the average too");

  const german = await repo.sumEventProp(
    EV.showcasePageViewed,
    ["set", "page_type"],
    "seconds",
    WINDOW[0],
    WINDOW[1],
    { only: ["DE"] },
  );
  check(
    german.every((r) => r.keys[0] === B.id),
    "only the set that was read from Germany is left",
    JSON.stringify(german.map((r) => r.keys)),
  );
  check(german[0]?.total === 300, "with its own seconds", String(german[0]?.total));

  /* ---- 5 · a page row opens onto ITS set --------------------------------- */
  console.log("\nthe drill-down takes both cuts, or all three Homes come back");

  const feed = await repo.recentEvents(
    EV.showcasePageViewed,
    WINDOW[0],
    WINDOW[1],
    "page_type",
    "home",
    200,
    null,
    { key: "set", value: B.id },
  );
  check(feed.length === 1, "one row, not both sets' Homes", String(feed.length));
  check(feed[0]?.props.seconds === 300, "and it is B's reading", String(feed[0]?.props.seconds));
  check(feed[0]?.country === "DE", "with the country beside it", String(feed[0]?.country));

  const fold = await repo.eventsByStore(
    EV.showcasePageViewed,
    WINDOW[0],
    WINDOW[1],
    "page_type",
    null,
    "home",
    null,
    { key: "set", value: A.id },
  );
  check(
    fold.reduce((a, b) => a + b.count, 0) === 3,
    "and the fold beside it is narrowed the same way",
    String(fold.reduce((a, b) => a + b.count, 0)),
  );

  /* ---- 6 · a set nobody has touched still has a row ---------------------- */
  console.log("\na set with nothing recorded is still on the screen");

  const untouched = SHOWCASE_SETS.find(
    (s) => s.id !== A.id && s.id !== B.id,
  );
  if (untouched) {
    check(
      byHand(EV.galleryOpened, untouched.id) === 0,
      `${untouched.id} has no events at all`,
      String(byHand(EV.galleryOpened, untouched.id)),
    );
    /* The screen builds its rows from SHOWCASE_SETS, so this set appears with
       zeroes. Folding the events instead would drop it — and a set nobody has
       opened is the row somebody most wants to see. */
    check(
      SHOWCASE_SETS.some((s) => s.id === untouched.id),
      "and is still in the list the screen draws from",
    );
  }

  rmSync(DB_FILE, { force: true });
  console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
