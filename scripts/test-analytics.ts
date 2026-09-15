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

  console.log(failures === 0 ? "\nall good\n" : `\n${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

export {};
