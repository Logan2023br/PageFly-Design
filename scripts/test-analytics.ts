/* ==========================================================================
   The numbers somebody will make decisions from.

       npx tsx scripts/test-analytics.ts

   Analytics is the one feature whose bugs do not look like bugs. A wrong count
   renders perfectly, reads plausibly, and gets acted on — a funnel that drops
   one event in five says "people are leaving at sign-in" just as convincingly
   as a real one. There is no screen that goes red.

   So this file is about the two ways that happens: an event that should have
   been counted and was not, and an event that was counted as something it is
   not. The public endpoint gets the same attention for a different reason —
   it takes writes from anybody.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
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

const DB_FILE = join(tmpdir(), "pfd-test-analytics.json");
rmSync(DB_FILE, { force: true });
process.env.PFD_DB_FILE = DB_FILE;
process.env.SESSION_SECRET = "analytics-test-secret-value-long-enough";

let failures = 0;
function check(ok: boolean, label: string, detail: string | null = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const WINDOW = ["2000-01-01T00:00:00.000Z", "2100-01-01T00:00:00.000Z"] as const;

async function main(): Promise<void> {
  const { POST } = await import("@/app/api/events/route");
  const { getRepo } = await import("@/lib/db");
  const repo = getRepo();

  let n = 0;
  const ev = (name: string, props: Record<string, unknown> = {}, visitorId = "visitor-one") => ({
    id: `id-${++n}-abcdefgh`,
    name,
    props,
    visitorId,
  });

  const send = async (events: unknown[]) => {
    const res = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events }),
      }),
    );
    return res.status;
  };

  const counts = async () => repo.countEvents(WINDOW[0], WINDOW[1]);
  const countOf = async (name: string) =>
    (await counts()).filter((c) => c.name === name).reduce((a, b) => a + b.count, 0);

  console.log("\na batch arrives");

  check((await send([ev("design_landing_viewed")])) === 204, "accepted");
  check((await countOf("design_landing_viewed")) === 1, "and counted");

  await send([
    ev("design_cta_clicked", { location: "hero" }),
    ev("design_cta_clicked", { location: "closing" }),
    ev("design_cta_clicked", { location: "hero" }),
  ]);

  const cta = (await counts()).filter((c) => c.name === "design_cta_clicked");
  check(cta.length === 2, "one row per combination of parameters", String(cta.length));
  /* The whole point of the CTA split: the screen must be able to say hero beat
     closing without this query knowing what either word means. */
  check(
    cta.find((c) => c.props.location === "hero")?.count === 2,
    "hero counted twice",
    JSON.stringify(cta.map((c) => [c.props.location, c.count])),
  );

  console.log("\npeople, not clicks");

  await send([
    ev("design_page_preview", {}, "visitor-two"),
    ev("design_page_preview", {}, "visitor-two"),
    ev("design_page_preview", {}, "visitor-three"),
  ]);
  const preview = (await counts()).find((c) => c.name === "design_page_preview")!;
  check(preview.count === 3, "three presses", String(preview.count));
  /* A funnel asks how many PEOPLE reached a step. Somebody opening four
     previews is one person who opened a preview, and a step counted in clicks
     can exceed the step above it and read as growth. */
  check(preview.visitors === 2, "by two people", String(preview.visitors));

  console.log("\nand the same event twice is once");

  const dupe = ev("design_brief_viewed");
  await send([dupe]);
  await send([dupe]);
  check(
    (await countOf("design_brief_viewed")) === 1,
    "a retried beacon does not double the count",
  );

  console.log("\nwhat the endpoint will not take");

  const before = (await counts()).reduce((a, b) => a + b.count, 0);

  check((await send([{ ...ev("design_x"), name: "totally_made_up" }])) === 204, "junk name answers 204");
  check((await countOf("totally_made_up")) === 0, "and is not recorded");
  check((await countOf("design_x")) === 0, "nor under any other name");

  await send(Array.from({ length: 60 }, () => ev("design_landing_viewed")));
  check(
    (await countOf("design_landing_viewed")) === 1,
    "a batch over the cap is dropped whole, not half-recorded",
    "a half-recorded batch is a number somebody would trust",
  );

  await send([{ id: "short", name: "design_landing_viewed", props: {}, visitorId: "visitor-one" }]);
  const after = (await counts()).reduce((a, b) => a + b.count, 0);
  check(after === before, "and a malformed row takes its batch with it", `${before} → ${after}`);

  console.log("\nthe props bag is not a free-for-all");

  await send([
    ev("design_register_submitted", {
      result: "validation_error",
      error_field: ["domain", "email"],
      count: 2,
      ok: false,
      /* Everything below must be dropped: an object, a huge string, a bad key. */
      nested: { a: 1 },
      huge: "x".repeat(400),
      "Bad-Key": "x",
    }),
  ]);
  const reg = (await counts()).find((c) => c.name === "design_register_submitted")!;
  check(reg.props.result === "validation_error", "a string survives");
  /* The register form checks three boxes and people fail several at once —
     recording only the first would make `domain` win every time, because it is
     the box at the top. */
  check(
    Array.isArray(reg.props.error_field) && (reg.props.error_field as string[]).length === 2,
    "and a list of fields, which is how a form with three boxes tells the truth",
    JSON.stringify(reg.props.error_field),
  );
  check(reg.props.count === 2 && reg.props.ok === false, "numbers and booleans survive");
  check(reg.props.nested === undefined, "an object does not");
  check(reg.props.huge === undefined, "nor a 400-character string");
  check(reg.props["Bad-Key"] === undefined, "nor a key outside the naming rule");

  console.log("\nwhose store it was");

  const rows = (await repo.countEvents(WINDOW[0], WINDOW[1])).length;
  check(rows > 0, "rows exist to check");
  /* The domain is read off the session cookie, never the body — otherwise any
     browser could attribute its events to somebody else's store and quietly
     move another merchant's numbers. */
  await send([{ ...ev("design_brief_viewed"), domain: "someone-else.myshopify.com" }]);
  const store = await import("@/lib/db").then((m) => m.getRepo());
  const all = await store.countEvents(WINDOW[0], WINDOW[1]);
  check(
    !JSON.stringify(all).includes("someone-else"),
    "a domain in the body is ignored",
  );

  console.log("\na clock that is wrong");

  /* The browser's clock may be off; it may not be off by enough to move an
     event into another day's numbers, because a day is what every rate on the
     screen is cut by. */
  await send([{ ...ev("design_generate_started"), at: "1999-01-01T00:00:00.000Z" }]);
  const recent = await repo.countEvents(
    new Date(Date.now() - 60_000).toISOString(),
    new Date(Date.now() + 60_000).toISOString(),
  );
  check(
    recent.some((c) => c.name === "design_generate_started"),
    "an event from 1999 is filed under now",
  );

  console.log("\nand the window is respected");

  const none = await repo.countEvents(
    "2001-01-01T00:00:00.000Z",
    "2001-01-02T00:00:00.000Z",
  );
  check(none.length === 0, "a range with nothing in it counts nothing", String(none.length));

  /* ==========================================================================
     EVERY NAME IS ACTUALLY FIRED SOMEWHERE.

     The failure this catches has no symptom. An event declared in `EV` and
     never wired to anything produces a count of zero, and zero renders exactly
     like "nobody did that" — so the screen reads as a finding rather than as a
     missing line of code, and somebody makes a decision on it.

     A grep, deliberately: a React component's click handler cannot be invoked
     from a script without a DOM, but whether the call site EXISTS is a
     question the source can answer.
     ========================================================================== */
  /* ==========================================================================
     TWO ACCOUNTS IN ONE BROWSER ARE TWO STORES AND ONE VISITOR.

     `visitorId` lives in a browser's localStorage, so it does not change when
     somebody signs out and signs in as somebody else. Counting the steps after
     sign-in in visitors reported 1 for exactly that — which is a true answer
     to a question nobody asked, and looked like events being dropped.

     The domain comes off the session cookie, which the test cannot set, so the
     rows are written through the repo directly. That is also the honest test:
     what is under examination is the counting, not the cookie.
     ========================================================================== */
  console.log("\ntwo accounts, one browser");

  const { randomUUID } = await import("node:crypto");
  await repo.recordEvents(
    ["shop-a.myshopify.com", "shop-b.myshopify.com"].flatMap((domain) =>
      /* Three presses each, so clicks, browsers and stores are all different
         numbers and none of them can be mistaken for another. */
      [0, 1, 2].map(() => ({
        id: randomUUID(),
        name: "design_page_exported",
        props: { scope: "one" },
        visitorId: "one-and-the-same-browser",
        domain,
        createdAt: new Date().toISOString(),
      })),
    ),
  );

  const exported = (await counts()).find(
    (c) => c.name === "design_page_exported" && c.props.scope === "one",
  )!;
  check(exported.count === 6, "six presses", String(exported.count));
  check(exported.visitors === 1, "from one browser", String(exported.visitors));
  check(exported.stores === 2, "belonging to two stores", String(exported.stores));

  console.log("\nand a step before sign-in has no store to count");

  await repo.recordEvents([
    {
      id: randomUUID(),
      name: "design_landing_viewed",
      props: {},
      visitorId: "a-stranger",
      domain: null,
      createdAt: new Date().toISOString(),
    },
  ]);
  const landing = (await counts()).find((c) => c.name === "design_landing_viewed")!;
  check(landing.stores === 0, "nulls are not a store", String(landing.stores));
  check(landing.visitors >= 1, "but the browser still counts", String(landing.visitors));

  /* ==========================================================================
     ONE PERSON IN TWO GROUPS IS STILL ONE PERSON, AND TWO ARE TWO.

     `countEvents` groups by name AND parameters, so somebody who pressed the
     install button on the landing page and again after an export lands in two
     rows. The first version of the distinct count took the largest of those
     rows, which is a FLOOR: it reported one person when two had pressed it.
     Summing the rows would have been the ceiling and equally wrong — the same
     person counted twice.

     Neither can be computed from the grouped rows at all. Only the store can
     intersect the id sets, which is what `countEventTotals` is for, and this
     is the case that proves it.
     ========================================================================== */
  console.log("\ndistinct people across parameter groups");

  {
    const { randomUUID: uuid2 } = await import("node:crypto");
    const row = (surface: string, visitorId: string) => ({
      id: uuid2(),
      name: "design_pagefly_install_clicked",
      props: { surface },
      visitorId,
      domain: null,
      createdAt: new Date().toISOString(),
    });

    /* Two people, six presses, three parameter groups — every number
       different, so none of them can be mistaken for another. */
    await repo.recordEvents([
      row("landing", "person-a"),
      row("landing", "person-a"),
      row("export_popup", "person-a"),
      row("landing_collections", "person-b"),
      row("landing_collections", "person-b"),
      row("landing_collections", "person-b"),
    ]);

    const grouped = (await counts()).filter(
      (c) => c.name === "design_pagefly_install_clicked",
    );
    check(grouped.length === 3, "three parameter groups", String(grouped.length));

    const totals = await repo.countEventTotals(WINDOW[0], WINDOW[1]);
    const install = totals.find((t) => t.name === "design_pagefly_install_clicked")!;

    check(install.count === 6, "six presses", String(install.count));
    check(install.visitors === 2, "by two people", String(install.visitors));
    /* The two wrong answers, named so a future change that reintroduces either
       fails here rather than on somebody's screen. */
    check(
      install.visitors !== Math.max(...grouped.map((g) => g.visitors)),
      "not the largest group, which is a floor",
      `largest group = ${Math.max(...grouped.map((g) => g.visitors))}`,
    );
    check(
      install.visitors !== grouped.reduce((a, g) => a + g.visitors, 0),
      "and not the sum, which counts one person twice",
      `sum = ${grouped.reduce((a, g) => a + g.visitors, 0)}`,
    );
  }

  /* ==========================================================================
     TWO OF THE SAME BUTTON ON ONE SCREEN ARE TWO NUMBERS.

     The landing page has two `Design now` buttons, the finished deck has two
     ways to export, and a collection can be taken by three different controls.
     Summed under one name, "which one do people press" has no answer — and
     that is the question the placements exist to settle.

     What makes it work is that each control sends a DIFFERENT parameter value.
     Two controls sharing one value is the failure this guards: it looks
     correct, adds up correctly, and silently answers a question nobody asked.
     Exactly what `scope: "set"` did for the two collection exports.
     ========================================================================== */
  console.log("\ntwo of the same button are two numbers");

  {
    const { randomUUID: uuid3 } = await import("node:crypto");
    const press = (name: string, props: Record<string, unknown>, n: number) =>
      Array.from({ length: n }, () => ({
        id: uuid3(),
        name,
        props,
        visitorId: "someone-pressing",
        domain: null,
        createdAt: new Date().toISOString(),
      }));

    /* Measured as a DELTA. An earlier block in this file records CTA presses
       of its own, and an absolute assertion here would have been a test that
       passes only while nothing above it changes. */
    const at = async (loc: string) =>
      (await counts()).find((c) => c.name === "design_cta_clicked" && c.props.location === loc)
        ?.count ?? 0;
    const heroBefore = await at("hero");
    const closingBefore = await at("closing");

    await repo.recordEvents([
      ...press("design_cta_clicked", { location: "hero" }, 9),
      ...press("design_cta_clicked", { location: "closing" }, 2),
      ...press("design_collection_exported", { scope: "set_card" }, 4),
      ...press("design_collection_exported", { scope: "set_detail" }, 1),
    ]);

    const heroAfter = await at("hero");
    const closingAfter = await at("closing");
    check(
      heroAfter - heroBefore === 9 && closingAfter - closingBefore === 2,
      "the two Design now buttons take 9 and 2, not one 11",
      `hero +${heroAfter - heroBefore}, closing +${closingAfter - closingBefore}`,
    );

    const coll = (await counts()).filter((c) => c.name === "design_collection_exported");
    const values = new Set(coll.map((c) => String(c.props.scope)));
    check(
      values.has("set_card") && values.has("set_detail"),
      "and the two ways to take a whole collection are told apart",
      [...values].join(", "),
    );
    /* The shape of the bug this replaced: one value covering two controls. */
    check(!values.has("set"), "the value that meant both is gone");
  }

  console.log("\nevery event has a call site");

  const { EV } = await import("@/lib/analytics");
  const { execSync } = await import("node:child_process");

  /* `lib/analytics.ts` itself is excluded — it is where the names are
     declared, so it would match every one of them. */
  /* `EV\.` rather than `track(EV\.`, because the runner writes its calls over
     several lines — `trackServer(` on one and the name on the next — and a
     line-based grep for the whole call misses them. The question here is only
     whether the constant is referenced at all outside its declaration. */
  const source = execSync(
    "grep -rn --include=*.ts --include=*.tsx 'EV\\.' components lib app || true",
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((l) => !l.startsWith("lib/analytics.ts:"))
    .join("\n");

  for (const [key, name] of Object.entries(EV)) {
    check(source.includes(`EV.${key}`), `${name}`, source.includes(`EV.${key}`) ? null : "declared but never fired");
  }

  /* And the other direction: a name the endpoint would refuse. Its regex is
     `^design_[a-z0-9_]+$`, and a name that fails it is dropped at the door — a
     404 nobody sees, for an event somebody thinks is being recorded. */
  console.log("\nand every name is one the endpoint accepts");
  const bad = Object.values(EV).filter((n) => !/^design_[a-z0-9_]+$/.test(n));
  check(bad.length === 0, "all names match the endpoint's rule", bad.join(", ") || "none");

  /* ======================================================================
     WHICH STORE, AND HOW MANY TIMES.

     A tile says "28 exports · 4 stores" and the next question is always the
     same: WHICH four, and which pages did they take. The totals cannot answer
     it — `countEvents` groups by name and parameters, so the domain that made
     each press is summed away.

     `eventsByStore` keeps it. One row per store per event name, with the
     parameter breakdown inside the row, so a tile can open into the list it is
     a summary of.
     ====================================================================== */
  console.log("\nthe detail behind a tile");

  {
    const at = (day: number) => `2024-03-${String(day).padStart(2, "0")}T10:00:00.000Z`;
    await repo.recordEvents([
      /* Two stores, four presses, three page types between them. */
      { id: "d1-aaaaaaaa", name: "design_page_exported", props: { page_type: "home" }, visitorId: "v1", domain: "alpha.myshopify.com", createdAt: at(1) },
      { id: "d2-aaaaaaaa", name: "design_page_exported", props: { page_type: "home" }, visitorId: "v1", domain: "alpha.myshopify.com", createdAt: at(3) },
      { id: "d3-aaaaaaaa", name: "design_page_exported", props: { page_type: "product" }, visitorId: "v1", domain: "alpha.myshopify.com", createdAt: at(2) },
      { id: "d4-aaaaaaaa", name: "design_page_exported", props: { page_type: "about" }, visitorId: "v9", domain: "beta.myshopify.com", createdAt: at(5) },
      /* A different event entirely — must not leak into the rows above. */
      { id: "d5-aaaaaaaa", name: "design_page_preview", props: { page_type: "home" }, visitorId: "v1", domain: "alpha.myshopify.com", createdAt: at(4) },
    ]);

    const rows = await repo.eventsByStore("design_page_exported", WINDOW[0], WINDOW[1], "page_type");

    /* One row per store, not one per press. Asserted on the two written just
       above rather than on the length: earlier blocks in this file export from
       other stores into the same repo, and a total that moves whenever
       somebody adds a fixture is a test that fails for the wrong reason. */
    const mine = rows.filter((r) => r.domain?.startsWith("alpha") || r.domain?.startsWith("beta"));
    check(mine.length === 2, "one row per store, not one per press", `${mine.length} row(s)`);

    const alpha = rows.find((r) => r.domain === "alpha.myshopify.com");
    check(alpha?.count === 3, "the store's own press count", String(alpha?.count));
    check(
      rows[0]?.domain === "alpha.myshopify.com",
      "busiest store first",
      rows.map((r) => r.domain).join(", "),
    );

    /* The whole reason for the drill-down: WHICH pages, not just how many. */
    const home = alpha?.parts.find((p) => p.key === "home");
    check(home?.count === 2, "and the page breakdown inside it", `home ×${home?.count}`);
    check(
      alpha?.parts.map((p) => p.key).join(",") === "home,product",
      "every page the store took, busiest first",
      alpha?.parts.map((p) => `${p.key}×${p.count}`).join(" "),
    );

    /* "When did this last happen" is the other question a tile cannot answer. */
    check(alpha?.lastAt === at(3), "the most recent press, for a sense of when", String(alpha?.lastAt));

    /* A preview is not an export. */
    check(
      !alpha?.parts.some((p) => p.key === "about"),
      "and no other event's rows are mixed in",
    );
  }

  /* ======================================================================
     THE STORE THAT IS NOT SIGNED IN.

     The tile everybody wants to open is "Not registered · 31", and it is the
     one the column cannot answer: a refused sign-in happens BEFORE there is a
     session, so `events.domain` is null for every one of them. The domain the
     merchant typed is on the event's own props instead.

     So the grouping key has to be selectable. Same query, same shape, keyed on
     a parameter rather than on the column — otherwise the whole gate block
     collapses into one row saying "nobody was signed in", which is true and
     useless.
     ====================================================================== */
  console.log("\nthe gate, where the store is a parameter and not a column");

  {
    const at = (day: number) => `2024-04-${String(day).padStart(2, "0")}T10:00:00.000Z`;
    const refused = (day: number, d: string, v: string) => ({
      id: `g${day}-${d.slice(0, 3)}-aaaa`,
      name: "design_signin_submitted",
      props: { result: "not_registered", domain: d },
      visitorId: v,
      domain: null,
      createdAt: at(day),
    });
    await repo.recordEvents([
      refused(1, "turnedaway.myshopify.com", "v-a"),
      refused(2, "turnedaway.myshopify.com", "v-a"),
      refused(3, "other.myshopify.com", "v-b"),
      {
        id: "g4-suc-aaaa",
        name: "design_signin_submitted",
        props: { result: "success", domain: "welcome.myshopify.com" },
        visitorId: "v-c",
        domain: null,
        createdAt: at(4),
      },
    ]);

    const rows = await repo.eventsByStore(
      "design_signin_submitted",
      WINDOW[0],
      WINDOW[1],
      "result",
      "domain",
    );

    const turned = rows.find((r) => r.domain === "turnedaway.myshopify.com");
    check(
      Boolean(turned),
      "the typed domain becomes the row, though nobody was signed in",
      rows.map((r) => r.domain).join(", ") || "(no rows)",
    );
    check(turned?.count === 2, "counted per store, not lumped under null", String(turned?.count));
    check(
      turned?.parts[0]?.key === "not_registered",
      "and the outcome is the breakdown inside it",
      turned?.parts.map((p) => `${p.key}×${p.count}`).join(" "),
    );
    check(
      rows.some((r) => r.domain === "welcome.myshopify.com"),
      "a store that got in is a row of its own",
    );
    check(
      !rows.some((r) => r.domain === null),
      "and nothing is left in a nameless bucket",
      rows.filter((r) => r.domain === null).map((r) => String(r.count)).join(",") || "none",
    );
  }

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
