/* ==========================================================================
   THE THỐNG KÊ NUMBERS, AND THE ONES THAT ARE WRONG WITHOUT LOOKING WRONG.

       npx tsx scripts/test-stats.ts

   Every figure on that screen is a count, and a count that is computed wrong
   is still a count. Nothing throws. The specific ways:

     A WINDOW THAT DOES NOT WINDOW. Drop the date clause from one of the seven
     queries behind this screen and it returns all-time figures under a button
     that says "7 days". Larger, plausible, and contradicted by nothing else on
     the page.

     A STORE THAT CLAIMED PAGES IT NEVER RECORDED counting as a store that
     built. The proof feed already has this rule for the same reason; the two
     must agree or the front door and the admin screen disagree about who is a
     customer.

     AN UNATTRIBUTED TOKEN FOLDED INTO A MODEL'S ROW. Runs from before
     per-model recording kept a count and no model. Credited to whichever model
     happens to be first, the row is a lie with a dollar sign on it.

   Seeded into the file-store driver; no database and no model.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pfd-stats-"));
process.env.PFD_DB_FILE = join(dir, "store.json");

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

let bad = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};
const head = (t: string) => console.log(`\n— ${t}`);
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

async function main(): Promise<void> {
  const { getRepo } = await import("../lib/db");
  const repo = getRepo();

  await repo.upsertStores([
    { domain: "a.myshopify.com", country: "VN", lastSeenAt: ago(1), blocked: false,
      email: null, storeName: null, shopifyPlan: null, currentPlan: null, daysUsed: null,
      userType: null, status: null, pageLimit: 30, firstSeenAt: null },
    { domain: "b.myshopify.com", country: "US", lastSeenAt: ago(1), blocked: false,
      email: null, storeName: null, shopifyPlan: null, currentPlan: null, daysUsed: null,
      userType: null, status: null, pageLimit: 30, firstSeenAt: null },
    /* Signed in, never built. */
    { domain: "c.myshopify.com", country: "US", lastSeenAt: ago(1), blocked: false,
      email: null, storeName: null, shopifyPlan: null, currentPlan: null, daysUsed: null,
      userType: null, status: null, pageLimit: 30, firstSeenAt: null },
    /* EMPTY STRING, not null — the shape that put two rows both labelled
       "Unplaced" on the live screen. */
    { domain: "e.myshopify.com", country: "", lastSeenAt: ago(1), blocked: false,
      email: null, storeName: null, shopifyPlan: null, currentPlan: null, daysUsed: null,
      userType: null, status: null, pageLimit: 30, firstSeenAt: null },
    /* And a genuine null. */
    { domain: "f.myshopify.com", country: null, lastSeenAt: ago(1), blocked: false,
      email: null, storeName: null, shopifyPlan: null, currentPlan: null, daysUsed: null,
      userType: null, status: null, pageLimit: 30, firstSeenAt: null },
    /* Built once, long ago, and never since — the only store that makes the
       standing figure and the windowed one differ. Without it the two agree by
       accident and the guard below proves nothing. */
    { domain: "g.myshopify.com", country: "JP", lastSeenAt: ago(40), blocked: false,
      email: null, storeName: null, shopifyPlan: null, currentPlan: null, daysUsed: null,
      userType: null, status: null, pageLimit: 30, firstSeenAt: null },
    /* On the list, never signed in. */
    { domain: "d.myshopify.com", country: null, lastSeenAt: null, blocked: false,
      email: null, storeName: null, shopifyPlan: null, currentPlan: null, daysUsed: null,
      userType: null, status: null, pageLimit: 30, firstSeenAt: null },
  ] as never);

  const run = (id: string, domain: string, when: string, types: string[], tokens: number) =>
    repo.saveRun(
      { id, domain, createdAt: when, payload: "{}", snapshot: null,
        pageCount: types.length, tokens, sell: "x", styleLabel: "y" } as never,
      types.map((t, i) => ({ runId: id, pageId: `${id}-p${i}`, pageType: t, label: t, index: i })),
    );

  /* Inside a seven-day window … */
  await run("r-recent-1", "a.myshopify.com", ago(2), ["home", "product", "product"], 1_000);
  await run("r-recent-2", "b.myshopify.com", ago(3), ["product", "collection"], 2_000);
  /* … and well outside it. */
  await run("r-old", "a.myshopify.com", ago(40), ["home", "home", "faq"], 9_000);

  /* The two halves of the absent country, on the same day. */
  await run("r-lapsed", "g.myshopify.com", ago(40), ["home"], 100);
  await run("r-blank", "e.myshopify.com", ago(2), ["home"], 100);
  await run("r-null", "f.myshopify.com", ago(2), ["home"], 100);

  /* A run that CLAIMED three pages and recorded none — the shape the proof
     feed's fixture once had by accident. */
  await repo.saveRun(
    { id: "r-empty", domain: "c.myshopify.com", createdAt: ago(2), payload: "{}", snapshot: null,
      pageCount: 3, tokens: 500, sell: "x", styleLabel: "y" } as never,
    [],
  );

  head("the window actually windows");
  const week = await repo.stats({ days: 7 });
  const all = await repo.stats({ days: 0 });
  ok("seven days counts only the recent pages", week.totalPages === 7, `${week.totalPages}`);
  ok("all time counts every page", all.totalPages === 11, `${all.totalPages}`);
  ok(
    "AND THE TWO ARE DIFFERENT",
    week.totalPages !== all.totalPages,
    "a window that returns the all-time figure is the failure this guards",
  );
  ok("the window is reported back", week.days === 7 && all.days === 0, `${week.days} / ${all.days}`);

  head("page types, which is what the tile opens into");
  const types = Object.fromEntries(week.pageTypes.map((t) => [t.type, t.pages]));
  ok("product is counted across both runs", types.product === 3, JSON.stringify(types));
  ok("home is counted three times", types.home === 3, String(types.home));
  ok("the out-of-window faq is absent", !("faq" in types));
  ok(
    "and they are ordered commonest first",
    week.pageTypes[0]?.type === "product" || week.pageTypes[0]?.type === "home",
    week.pageTypes.map((t) => `${t.type}:${t.pages}`).join(" "),
  );
  ok(
    "the parts add up to the total",
    week.pageTypes.reduce((n, t) => n + t.pages, 0) === week.totalPages,
    "a breakdown that does not sum to the tile above it is worse than none",
  );

  head("who is actually using it");
  ok("six stores signed in", all.activeStores === 6, `${all.activeStores}`);
  ok(
    "ONLY TWO BUILT — a claim with no page rows is not a build",
    all.builtStores === 5,
    `${all.builtStores}; c.myshopify.com claimed 3 pages and recorded none`,
  );
  ok("and the rest are signed in only", all.idleStores === 1, `${all.idleStores}`);
  ok("built and idle add up to signed in", all.builtStores + all.idleStores === all.activeStores);

  head("where they are");
  const geo = Object.fromEntries(all.countries.map((c) => [c.country, c.pages]));
  ok("vietnam has both of a's runs", geo.VN === 6, JSON.stringify(geo));
  ok("the us has b's", geo.US === 2);
  ok("a store that never built is not a country row", !Object.values(geo).includes(0));

  head("and the money");
  await repo.recordModelCall({
    id: "r-recent-1:0", createdAt: ago(2), domain: "a.myshopify.com", stage: "build",
    vendor: "anthropic", model: "claude-opus-5-5",
    input: 1_000_000, output: 100_000, cached: 0, reasoning: 0, costUsd: 4 + 2,
  });
  await repo.recordModelCall({
    id: "x1:0", createdAt: ago(2), domain: null, stage: "export",
    vendor: "deepseek", model: "deepseek-v4-flash",
    input: 273_566, output: 135_679, cached: 151_040, reasoning: 0, costUsd: 0.2005,
  });

  const spend = (await repo.stats({ days: 7 })).spend;
  ok("both models have a row", spend.rows.length === 2, spend.rows.map((r) => r.model).join(" "));
  ok(
    "dearest first",
    spend.rows[0]?.model === "claude-opus-5-5",
    spend.rows.map((r) => `${r.model} $${r.costUsd}`).join(" · "),
  );
  ok(
    "the export call is in it at all",
    spend.rows.some((r) => r.model === "deepseek-v4-flash"),
    "this is the spend that was previously only console.logged",
  );

  /* `r-recent-2` and `r-empty` have no per-call rows: 2,000 + 500 tokens that
     belong to no model. */
  ok(
    "TOKENS WITH NO MODEL ARE KEPT APART",
    spend.unattributedTokens === 2_700,
    `${spend.unattributedTokens} — folding them into a model's row invents an attribution`,
  );
  ok(
    "and the total refuses to be a dollar figure while any are unattributed",
    spend.totalCostUsd === null,
    "a bill smaller than the real one looks exactly like a bill that is right",
  );
  ok(
    "but the token total still includes them",
    spend.totalTokens === 1_100_000 + 409_245 + 2_700,
    `${spend.totalTokens}`,
  );

  head("ONE ROW PER GROUP, and an empty country is not a second Unplaced");
  /* Seen on the live screen: two rows, both reading "Unplaced", because null
     and the empty string are different group keys and `countryLabel` answers
     both with the same word. A duplicate row is not a crash and not obviously
     wrong — it just quietly splits one number into two. */
  const labels = all.countries.map((c) => c.country);
  ok(
    "null and empty land in the same bucket",
    labels.filter((c) => c === "unknown").length === 1,
    labels.join(" "),
  );
  ok("and there is no bare empty-string row", !labels.includes(""), labels.join(" "));
  const unplaced = all.countries.find((c) => c.country === "unknown");
  ok("which holds both of their stores", unplaced?.stores === 2, `${unplaced?.stores}`);

  head("one day, picked");
  const theDay = ago(2).slice(0, 10);
  const oneDay = await repo.stats({ day: theDay });
  ok("it echoes the day back", oneDay.day === theDay, String(oneDay.day));
  ok(
    "and counts only that day",
    oneDay.totalPages === 5,
    `${oneDay.totalPages} — r-recent-1 (3) + r-blank (1) + r-null (1)`,
  );
  ok(
    "NOT THE WHOLE WINDOW",
    oneDay.totalPages !== week.totalPages,
    "a day filter that returns the window is the failure this guards",
  );
  const otherDay = await repo.stats({ day: ago(3).slice(0, 10) });
  ok("a different day is a different answer", otherDay.totalPages === 2, `${otherDay.totalPages}`);

  head("one country, picked");
  const vn = await repo.stats({ days: 7, only: ["VN"] });
  ok("it echoes the pick back", JSON.stringify(vn.only) === '["VN"]', JSON.stringify(vn.only));
  ok("pages are only that country's", vn.totalPages === 3, `${vn.totalPages}`);
  ok(
    "NOT EVERYBODY'S",
    vn.totalPages !== week.totalPages,
    "a country filter that returns everything is the failure this guards",
  );
  ok(
    "THE CHIPS STILL SHOW EVERY COUNTRY",
    vn.countries.length === week.countries.length,
    "filtered down to the one picked, there would be nothing left to switch to",
  );
  const us = await repo.stats({ days: 7, only: ["US"] });
  ok("another country is another answer", us.totalPages === 2, `${us.totalPages}`);
  ok(
    "and the two add up with the rest",
    vn.totalPages + us.totalPages + (await repo.stats({ days: 7, only: ["unknown"] })).totalPages ===
      week.totalPages,
    "every page belongs to exactly one bucket",
  );

  head("and the two filters compose");
  const both = await repo.stats({ day: theDay, only: ["VN"] });
  ok("day and country together", both.totalPages === 3, `${both.totalPages}`);

  head("AND THE STORE TILE OBEYS THE FILTER TOO");
  /* Reported from the live screen: every country showed 70 stores. The tile
     was built from `count(*) from stores` with nothing attached, so it was the
     one figure on a filtered screen that answered a different question — and a
     number that does not move when the filter moves reads as a stuck number,
     not as a deliberate all-time total. */
  const vnStores = await repo.stats({ days: 0, only: ["VN"] });
  ok(
    "signed-in stores are the country's",
    vnStores.activeStores === 1,
    `${vnStores.activeStores} — only a.myshopify.com is VN`,
  );
  ok(
    "NOT EVERYBODY'S",
    vnStores.activeStores !== all.activeStores,
    `${vnStores.activeStores} vs ${all.activeStores} — the live bug was these being equal`,
  );
  ok("the beta list narrows too", vnStores.allowedStores === 1, `${vnStores.allowedStores}`);
  ok("and so does who built", vnStores.builtStores === 1, `${vnStores.builtStores}`);

  const usStores = await repo.stats({ days: 0, only: ["US"] });
  ok(
    "another country is another set",
    usStores.activeStores === 2 && usStores.builtStores === 1,
    `${usStores.activeStores} signed in, ${usStores.builtStores} built — c never built`,
  );
  ok(
    "the parts still add up inside the filter",
    usStores.builtStores + usStores.idleStores === usStores.activeStores,
  );

  head("and the window gets its own row rather than moving that one");
  /* Two questions, not one. "How many stores do we have" is a standing fact
     and would read as a collapse under a one-day window; "how many built in
     this window" is the windowed question, and it gets its own figure instead
     of quietly redefining the first. */
  const wideBuilt = (await repo.stats({ days: 0 })).builtStores;
  const weekBuilt = (await repo.stats({ days: 7 })).builtStoresInWindow;
  const oldBuilt = (await repo.stats({ day: ago(40).slice(0, 10) })).builtStoresInWindow;
  ok("the standing figure ignores the window", (await repo.stats({ days: 7 })).builtStores === wideBuilt,
     `${wideBuilt}`);
  ok("the windowed one does not", weekBuilt === 4, `${weekBuilt} built in the last 7 days`);
  ok("a day forty days back is a different set", oldBuilt === 2, `${oldBuilt} — a and g`);
  ok(
    "AND THE TWO ARE NOT THE SAME NUMBER",
    weekBuilt !== wideBuilt,
    "one figure answering both questions is how the tile got stuck in the first place",
  );

  head("several countries at once, and one country out");
  /* Matching the analytics screen, whose chips are a three-way control and
     whose note says why: "show me Vietnam" and "show me everything except
     Vietnam" are both things people want, and a checkbox expresses only the
     first. The predicate itself is `geoClause`/`geoAllows`, already written
     once per driver and already checked against each other — a third
     implementation for this screen is the thing that drifts. */
  const two = await repo.stats({ days: 7, only: ["VN", "US"] });
  ok(
    "the pages are both countries'",
    two.totalPages === vn.totalPages + us.totalPages,
    `${two.totalPages} = ${vn.totalPages} + ${us.totalPages}`,
  );
  ok(
    "AND MORE THAN EITHER ALONE",
    two.totalPages > vn.totalPages && two.totalPages > us.totalPages,
    "a second chip that changes nothing is a chip that is being ignored",
  );
  ok("the stores are both countries'", two.activeStores === 3, `${two.activeStores} — a, b, c`);
  ok(
    "order does not matter",
    (await repo.stats({ days: 7, only: ["US", "VN"] })).totalPages === two.totalPages,
  );
  ok(
    "an empty pick is every country",
    (await repo.stats({ days: 7, only: [] })).totalPages === week.totalPages,
    "no chip lit must mean all, never none",
  );
  ok("and the chips are still the whole list", two.countries.length === week.countries.length);

  const notVn = await repo.stats({ days: 7, except: ["VN"] });
  ok(
    "excluding one leaves the rest",
    notVn.totalPages === week.totalPages - vn.totalPages,
    `${notVn.totalPages} = ${week.totalPages} - ${vn.totalPages}`,
  );
  ok(
    "AND IT IS NOT THE SAME AS PICKING IT",
    notVn.totalPages !== vn.totalPages,
    "an except read as an only is a filter showing the exact opposite of what it says",
  );
  ok(
    "the unplaced bucket can be excluded too",
    (await repo.stats({ days: 7, except: ["unknown"] })).totalPages ===
      vn.totalPages + us.totalPages,
    "null and empty are one bucket, so excluding it must drop both",
  );

  console.log(bad === 0 ? "\nall good" : `\n${bad} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(bad === 0 ? 0 : 1);
}

void main();
