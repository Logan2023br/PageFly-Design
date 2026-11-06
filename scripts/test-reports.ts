/* ==========================================================================
   Weekly reports of the three upsells — the week's edges (Vietnam time), the
   cohort and activity numbers of each, saving, and the Monday 01:00 run.

       REPORTS_TEST_DATABASE_URL=postgres://postgres@localhost:5432/reports_test \
         npx tsx scripts/test-reports.ts

   THE DATABASE IS WIPED — every upsell_*, ssu_* and ucp2_* table is dropped first.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

const url = process.env.REPORTS_TEST_DATABASE_URL;
if (!url) {
  console.log("REPORTS_TEST_DATABASE_URL is not set — skipping (this test needs a throwaway Postgres).");
  process.exit(0);
}
for (const k of Object.keys(process.env)) if (/^postgres(ql)?:\/\//.test(process.env[k] ?? "")) delete process.env[k];
process.env.DATABASE_URL = url;
process.env.REPORTS_DISABLE_TIMER = "1";
process.env.UCP2_DISABLE_TIMER = "1";
process.env.SSU_DISABLE_TIMER = "1";
process.env.UPSELL_DISABLE_TIMER = "1";

let failed = 0;
function check(ok: unknown, what: string, detail?: unknown) {
  if (ok) console.log(`  ✓ ${what}`);
  else {
    failed++;
    console.log(`  ✗ ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const W = "2026-10-26"; // Monday; the week ends 2026-11-02 00:00 Vietnam time
const t = (s: string) => new Date(s).toISOString();

async function main() {
  const { Pool } = await import("pg");
  const raw = new Pool({ connectionString: url });
  const { rows: tables } = await raw.query<{ t: string }>(
    "select tablename as t from pg_tables where schemaname = 'public' and (tablename like 'upsell\\_%' or tablename like 'ssu\\_%' or tablename like 'ucp2\\_%')",
  );
  if (tables.length) await raw.query(`drop table if exists ${tables.map((r) => r.t).join(", ")} cascade`);
  await raw.end();

  const defs = await import("../lib/reports/defs");
  const compute = await import("../lib/reports/compute");
  const store = await import("../lib/reports/store");
  const upsellDb = await (await import("../lib/upsell/db")).db();
  const ssuDb = await (await import("../lib/storeSetUpsell/db")).db();
  const ucp2Db = await (await import("../lib/ucp2/db")).db();

  console.log("weeks, Vietnam time");
  check(defs.weekOf(new Date("2026-11-01T23:30:00+07:00")) === W, "Sunday 23:30 is still the week");
  check(defs.weekOf(new Date("2026-11-02T00:10:00+07:00")) === "2026-11-02", "Monday 00:10 is the next one");
  check(defs.weekOf(new Date("2026-10-26T00:00:00+07:00")) === W, "Monday 00:00 opens it");
  check(defs.isWeek(W) && !defs.isWeek("2026-10-27") && !defs.isWeek("x"), "only a Monday is a week");
  check(defs.weekLabel(W) === "26/10 – 01/11/2026", "label", defs.weekLabel(W));

  console.log("Upsell Build 2 pages");
  await upsellDb.query(
    `insert into upsell_leads (lead_id, store_domain, "group", status, sent_at, created_at, built_at, message_read, replied, last_reply_at, upgraded, upgraded_at, mrr_added, whatsapp_sent_at) values
       ('LA', 'a.myshopify.com', 'test', 'upgraded', $1, $1, $1, true, true, $1, true, $2, 24, $1),
       ('LB', 'b.myshopify.com', 'test', 'sent', $1, $1, $1, false, false, null, false, null, null, null),
       ('LC', 'c.myshopify.com', 'test', 'sent', $3, $3, $3, false, true, $1, false, null, null, null),
       ('LD', 'd.myshopify.com', 'control', 'control', null, $1, null, null, null, null, true, $1, 19, null)`,
    [t("2026-10-27T10:00:00+07:00"), t("2026-11-03T09:00:00+07:00"), t("2026-10-20T10:00:00+07:00")],
  );
  await upsellDb.query("insert into upsell_designs (id, lead_id) values ('DA', 'LA'), ('DC', 'LC')");
  await upsellDb.query(
    `insert into upsell_events (lead_id, design_id, type, actor, created_at) values
       ('LA', 'DA', 'view', 'customer', $1), ('LA', 'DA', 'view', 'customer', $2),
       ('LA', 'DA', 'download', 'customer', $3), ('LA', 'DA', 'view', 'admin', $1),
       ('LC', 'DC', 'view', 'customer', $1)`,
    [t("2026-10-28T10:00:00+07:00"), t("2026-11-01T23:30:00+07:00"), t("2026-11-02T00:30:00+07:00")],
  );
  await upsellDb.query(
    `insert into upsell_messages (id, lead_id, kind, content, status, created_by, sent_at) values
       ('m1', 'LA', 'initial', 'x', 'sent', 't', $1), ('m2', 'LB', 'initial', 'x', 'sent', 't', $1),
       ('m3', 'LB', 'followup1', 'x', 'sent', 't', $2), ('m4', 'LC', 'initial', 'x', 'sent', 't', $3),
       ('m5', 'LB', 'followup2', 'x', 'pending_review', 't', null)`,
    [t("2026-10-27T10:00:00+07:00"), t("2026-10-28T10:00:00+07:00"), t("2026-10-20T10:00:00+07:00")],
  );
  const b = await compute.computeReport("bpu", W);
  const bm = b.metrics;
  check(bm.c_sent === 2 && bm.c_read === 1 && bm.c_replied === 1, "cohort: the two sent this week, one read and replied", bm);
  check(bm.c_viewed === 1 && bm.c_views === 2 && bm.c_downloaded === 1 && bm.c_downloads === 1, "…views and downloads by the customer only, whenever they came", bm);
  check(bm.c_upgraded === 1 && bm.c_mrr === 24 && bm.c_up_claim === 1 && bm.c_up_normal === 0, "…the upgrade next week still counts for the cohort, as claim", bm);
  check(bm.c_whatsapp === 1, "…WhatsApp", bm);
  check(bm.k_control === 1 && bm.k_upgraded === 1, "control: new this week, upgraded", bm);
  check(bm.a_replied === 2, "activity: replies in the week, last week's lead too", bm.a_replied);
  check(bm.a_upgraded === 0 && bm.a_mrr === 0, "…the upgrade on 3/11 is not this week's", bm);
  check(bm.a_views === 3 && bm.a_viewers === 2, "…views up to Sunday 23:30", bm);
  check(bm.a_downloads === 0, "…the Monday 00:30 download is next week's", bm.a_downloads);
  check(bm.a_messages === 3 && b.messages.some((m) => m.label === "Follow-up 1" && m.n === 1), "…messages sent, per kind; drafts not counted", b.messages);
  check(b.prev.c_sent === 1 && b.prev.a_messages === 1, "the week before, for the arrows", b.prev);

  console.log("Upsell Collection Pages");
  await ssuDb.query(
    `insert into ssu_customers (store_domain, sent_at, delivered_at, read_at, replied, last_reply_at, reviewed_at, upgraded_at, upgraded_price, price_at_send, pages_updated_at, first_selected_at) values
       ('s1.myshopify.com', $1, $1, $1, true, $1, $2, $2, 24, 0, $1, $1),
       ('s2.myshopify.com', $1, $1, null, false, null, null, null, null, 0, null, $1),
       ('s3.myshopify.com', $3, $3, $3, false, null, $1, $1, 49, 19, null, $3)`,
    [t("2026-10-27T10:00:00+07:00"), t("2026-11-04T10:00:00+07:00"), t("2026-10-20T10:00:00+07:00")],
  );
  await ssuDb.query(
    `insert into ssu_selections (insert_id, event_time, store_domain, store_set) values
       ('i1', $1, 's1.myshopify.com', 'a'), ('i2', $1, 's1.myshopify.com', 'a'), ('i3', $1, 's2.myshopify.com', 'b'), ('i4', $2, 's9.myshopify.com', 'b')`,
    [t("2026-10-27T10:00:00+07:00"), t("2026-11-02T08:00:00+07:00")],
  );
  await ssuDb.query(
    `insert into ssu_messages (id, store_domain, kind, content, status, created_by, sent_at) values
       ('x1', 's1.myshopify.com', 'thanks', 'x', 'sent', 't', $1), ('x2', 's2.myshopify.com', 'thanks', 'x', 'sent', 't', $1)`,
    [t("2026-10-27T10:00:00+07:00")],
  );
  const s = (await compute.computeReport("ssu", W)).metrics;
  check(s.c_sent === 2 && s.c_read === 1 && s.c_replied === 1 && s.c_reviewed === 1 && s.c_upgraded === 1 && s.c_mrr === 24, "cohort", s);
  check(s.a_clicks === 3 && s.a_clicked_stores === 2 && s.a_new_customers === 2, "activity: Select template clicks in the week", s);
  check(s.a_upgraded === 1 && s.a_mrr === 30 && s.a_reviewed === 1, "…last week's customer upgrading this week, by what it added", s);
  check(s.a_messages === 2, "…messages", s.a_messages);

  console.log("Upsell Collection Pages 2");
  await ucp2Db.query(
    `insert into ucp2_rows (session_id, sent_at, store_domain, type_user, delivered_at, read_at, clicked_at, clicks, replied_at, replies, upgraded_at, upgraded_price, reviewed_at) values
       ('u1', $1, 'u1.myshopify.com', 'Resolved', $1, $1, $1, 3, $1, 2, $1, 24, $1),
       ('u2', $1, 'u2.myshopify.com', 'New install', $1, null, null, 0, null, 0, null, null, null),
       ('u3', $2, 'u3.myshopify.com', 'Resolved', $2, $1, null, 0, null, 0, null, null, null)`,
    [t("2026-10-27T10:00:00+07:00"), t("2026-10-20T10:00:00+07:00")],
  );
  const u = await compute.computeReport("ucp2", W);
  check(u.metrics.c_sent === 2 && u.metrics.c_read === 1 && u.metrics.c_clicks === 3 && u.metrics.c_replies === 2 && u.metrics.c_mrr === 24, "cohort", u.metrics);
  check(u.metrics.a_read === 2, "activity: reads in the week, last week's row too", u.metrics.a_read);
  check(u.byType?.length === 2 && u.byType.find((x) => x.type === "Resolved")?.upgraded === 1, "per Type User", u.byType);
  check(u.messages[0]?.n === 2, "one invite per row sent", u.messages);

  console.log("saving, and Monday 01:00");
  check((await store.saveReport("bpu", defs.weekOf(), "t")) === null, "this week cannot be saved: it is not over");
  check((await store.runDueReports(new Date("2026-11-02T00:40:00+07:00"))).length === 0, "Monday 00:40: nothing yet");
  const made = await store.runDueReports(new Date("2026-11-02T01:10:00+07:00"));
  const key = made.map((m) => `${m.upsell} ${m.week}`).sort();
  check(
    JSON.stringify(key) === JSON.stringify(["bpu 2026-10-19", "bpu 2026-10-26", "ssu 2026-10-19", "ssu 2026-10-26", "ucp2 2026-10-19", "ucp2 2026-10-26"]),
    "Monday 01:10: every finished week since the first send, each upsell",
    key,
  );
  check((await store.runDueReports(new Date("2026-11-02T01:20:00+07:00"))).length === 0, "…once");
  const saved = await store.getReport("bpu", W);
  check(saved?.generated_by === "auto" && saved.data.metrics.c_sent === 2, "kept as made", saved?.generated_by);
  await upsellDb.query("update upsell_leads set message_read = true where lead_id = 'LB'");
  check((await store.getReport("bpu", W))?.data.metrics.c_read === 1, "a saved report does not move with the data");
  const again = await store.saveReport("bpu", W, "admin:t", true);
  check(again?.generated_by === "admin:t" && again.data.metrics.c_read === 2, "Tạo lại works it out again", again?.generated_by);
  check((await store.listReports("bpu")).map((r) => r.week).join() === "2026-10-26,2026-10-19", "listed newest first");
  const live = await store.liveReport("bpu", defs.weekOf());
  check(live.live === true, "this week: worked out live, not saved");

  await (await import("../lib/upsell/db")).closeUpsellPool?.();
  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
