/* ==========================================================================
   Store set upsell — the rules, against a real Postgres, with Mixpanel, AC2
   and Crisp answered by a stub in place of `fetch`.

       SSU_TEST_DATABASE_URL=postgres://postgres@localhost:5432/ssu_test \
         npx tsx scripts/test-store-set-upsell.ts

   THE DATABASE IS WIPED — every ssu_* table is dropped first.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import assert from "node:assert/strict";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

const url = process.env.SSU_TEST_DATABASE_URL;
if (!url) {
  console.log("SSU_TEST_DATABASE_URL is not set — skipping (this test needs a throwaway Postgres).");
  process.exit(0);
}
for (const k of Object.keys(process.env)) if (/^postgres(ql)?:\/\//.test(process.env[k] ?? "")) delete process.env[k];
process.env.DATABASE_URL = url;
process.env.SSU_DISABLE_TIMER = "1";
process.env.UPSELL_DISABLE_TIMER = "1";
process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME = "sa.user";
process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET = "sa-secret";
process.env.CRISP_IDENTIFIER = "crisp-id";
process.env.CRISP_KEY = "crisp-key";
process.env.AC2_TOKEN = "ac2-token";

/* ---------------------------------------------------------------- the stub */

type Conv = { session_id: string; email: string; app_review?: unknown; messages: Record<string, unknown>[] };
const world = {
  events: [] as { event: string; properties: Record<string, unknown> }[],
  stores: {} as Record<string, Record<string, unknown>>,
  convs: [] as Conv[],
  sent: [] as { sid: string; content: string; nickname: string }[],
  exportCalls: 0,
};
const reply = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  const method = init?.method ?? "GET";
  if (u.host === "data.mixpanel.com") {
    world.exportCalls++;
    assert.match(String((init?.headers as Record<string, string>).Authorization), /^Basic /);
    return reply(world.events.map((e) => JSON.stringify(e)).join("\n"));
  }
  if (u.host === "ac2.pagefly.io") {
    const d = decodeURIComponent(u.pathname.split("/").pop()!);
    return world.stores[d] ? reply(world.stores[d]) : reply({}, 404);
  }
  if (u.host === "api.crisp.chat") {
    const path = u.pathname.replace(/^\/v1\/website\/[^/]+/, "");
    let m;
    if ((m = path.match(/^\/conversations\/(\d+)$/))) {
      const q = u.searchParams.get("search_query") ?? "";
      const list = Number(m[1]) === 1 ? world.convs.filter((c) => c.email.includes(q)) : [];
      return reply({ error: false, data: list.map((c) => ({ session_id: c.session_id, updated_at: Date.now(), meta: { email: c.email, data: { app_review: c.app_review } } })) });
    }
    if (path.startsWith("/people/data/")) return reply({ error: true, reason: "people_not_found" }, 404);
    if (path === "/conversation" && method === "POST") {
      const sid = `session_${world.convs.length + 1}`;
      world.convs.push({ session_id: sid, email: "", messages: [] });
      return reply({ error: false, data: { session_id: sid } });
    }
    if ((m = path.match(/^\/conversation\/([^/]+)\/meta$/))) {
      const c = world.convs.find((x) => x.session_id === m![1])!;
      if (method === "PATCH") c.email = JSON.parse(String(init!.body)).email;
      return reply({ error: false, data: { data: { app_review: c.app_review } } });
    }
    if ((m = path.match(/^\/conversation\/([^/]+)\/message$/))) {
      const b = JSON.parse(String(init!.body));
      const c = world.convs.find((x) => x.session_id === m![1])!;
      if (b.type === "text") {
        c.messages.push({ type: "text", from: "operator", content: b.content, timestamp: Date.now() });
        world.sent.push({ sid: c.session_id, content: b.content, nickname: b.user.nickname });
      }
      return reply({ error: false, data: {} });
    }
    if ((m = path.match(/^\/conversation\/([^/]+)\/messages$/))) {
      return reply({ error: false, data: world.convs.find((x) => x.session_id === m![1])!.messages });
    }
    if (path.match(/\/state$/)) return reply({ error: false, data: {} });
  }
  throw new Error(`unexpected fetch ${method} ${u}`);
}) as typeof fetch;

/* ---------------------------------------------------------------- run */

const ev = (domain: string, email: string, set: string, minutesAgo: number, extra: Record<string, unknown> = {}) => ({
  event: "select_template",
  properties: {
    time: Math.floor((Date.now() - minutesAgo * 60_000) / 1000),
    $insert_id: `${domain}-${set}-${minutesAgo}`,
    distinct_id: `d-${domain}`,
    shopify_domain: `\n${domain}`,
    email,
    store_set: set,
    template_id: `${set}-home`,
    page_type: "home",
    template_type: "page_template",
    mp_country_code: "US",
    $city: "Austin",
    ...extra,
  },
});
const store = (domain: string, extra: Record<string, unknown> = {}) => ({
  shopDomain: domain,
  name: domain.split(".")[0].toUpperCase(),
  email: `owner@${domain}`,
  phone: "+1 555",
  country: "US",
  timezone: "America/Chicago",
  shopifyPlan: "Basic",
  pageflyPlan: "Free",
  pageflyPrice: 0,
  totalPages: 2,
  numPublished: 1,
  status: "installed",
  createdAt: "2026-10-01T00:00:00Z",
  ...extra,
});

async function main() {
  const { db } = await import("../lib/storeSetUpsell/db");
  const p = await db();
  await p.query("drop table if exists ssu_events, ssu_messages, ssu_selections, ssu_customers, ssu_settings cascade");
  const dbm = await import("../lib/storeSetUpsell/db");
  dbm.resetStoreSetSchema();
  await dbm.db();

  const { runJob } = await import("../lib/storeSetUpsell/job");
  const { saveSsuSettings } = await import("../lib/storeSetUpsell/settings");
  const { messageAction, customerAction } = await import("../lib/storeSetUpsell/actions");
  const { listCustomers, ssuCounts } = await import("../lib/storeSetUpsell/queries");

  // a: fresh customer; b: already reviewed 5★ ("5" as text); c: dev store; d: same store twice
  world.events = [
    ev("alpha.myshopify.com", "owner@alpha.myshopify.com", "aurum", 3),
    ev("alpha.myshopify.com", "owner@alpha.myshopify.com", "ember-roast", 2),
    ev("beta.myshopify.com", "owner@beta.myshopify.com", "aurum", 2),
    ev("gamma.myshopify.com", "owner@gamma.myshopify.com", "verdant", 1, { is_dev_store: true }),
  ];
  world.stores = {
    "alpha.myshopify.com": store("alpha.myshopify.com"),
    "beta.myshopify.com": store("beta.myshopify.com"),
    "gamma.myshopify.com": store("gamma.myshopify.com", { shopifyPlan: "Development" }),
  };
  world.convs = [{ session_id: "old_beta", email: "owner@beta.myshopify.com", app_review: "5", messages: [] }];

  let r = await runJob();
  assert.deepEqual(r.errors, []);
  assert.equal(r.new_selections, 4);
  assert.equal(r.new_customers, 3);
  assert.equal(r.drafted, 1, "manual mode: one draft, for alpha only");

  const status = async (d: string) => (await p.query("select * from ssu_customers where store_domain = $1", [d])).rows[0];
  assert.equal((await status("alpha.myshopify.com")).status, "pending_review");
  assert.deepEqual((await status("alpha.myshopify.com")).sets, ["aurum", "ember-roast"]);
  assert.equal((await status("beta.myshopify.com")).status, "reviewed");
  assert.equal(Number((await status("beta.myshopify.com")).app_review), 5);
  assert.equal((await status("gamma.myshopify.com")).status, "skipped");
  assert.equal(world.sent.length, 0, "nothing sent before approval");

  // the same events again: deduplicated
  r = await runJob();
  assert.equal(r.new_selections, 0);

  // approve & send: from Logan, with the store name and the set
  const msg = (await p.query("select * from ssu_messages where store_domain = 'alpha.myshopify.com'")).rows[0];
  assert.match(msg.content, /Hi \*\*ALPHA\*\*/);
  assert.match(msg.content, /Ember Roast|Aurum/);
  assert.match(msg.content, /Logan – PageFly Support/);
  await messageAction(msg.id, "approve", null, "admin:test");
  assert.equal(world.sent.length, 1);
  assert.equal(world.sent[0].nickname, "Logan");
  const a = await status("alpha.myshopify.com");
  assert.equal(a.status, "sent");
  assert.ok(a.crisp_session);

  // a draft for a store that reviews 5★ between drafting and sending is blocked
  world.events.push(ev("delta.myshopify.com", "owner@delta.myshopify.com", "pawsome", 0));
  world.stores["delta.myshopify.com"] = store("delta.myshopify.com");
  await runJob();
  assert.equal((await status("delta.myshopify.com")).status, "pending_review");
  world.convs.push({ session_id: "delta_old", email: "owner@delta.myshopify.com", app_review: 5, messages: [] });
  const dm = (await p.query("select id from ssu_messages where store_domain = 'delta.myshopify.com'")).rows[0];
  await assert.rejects(messageAction(dm.id, "approve", null, "admin:test"), /5★/);
  assert.equal(world.sent.length, 1, "blocked: nothing sent");
  const d = await status("delta.myshopify.com");
  assert.equal(d.status, "reviewed");
  assert.equal(d.crisp_conversations, 1);
  assert.equal(d.reviewed_at, null, "reviewed_at is for a review after our message");

  // the customer reads and replies → Đã đọc, Có phản hồi, Cần kiểm tra
  const conv = world.convs.find((c) => c.session_id === a.crisp_session)!;
  conv.messages[0].read = "chat";
  conv.messages.push({ type: "text", from: "user", content: "Can you change the hero color?", timestamp: Date.now() + 1000 });
  await customerAction("alpha.myshopify.com", "recheck", {}, "admin:test");
  const a2 = await status("alpha.myshopify.com");
  assert.ok(a2.read_at && a2.delivered_at);
  assert.equal(a2.replied, true);
  assert.equal(a2.needs_check, true);
  assert.match(a2.last_reply_text, /hero color/);
  assert.equal((await listCustomers("needs_check", { page: 1 })).total, 1);
  await customerAction("alpha.myshopify.com", "mark_checked", {}, "admin:test");
  assert.equal((await status("alpha.myshopify.com")).needs_check, false);

  // review ask goes into the same conversation
  const ra = (await customerAction("alpha.myshopify.com", "draft_review", {}, "admin:test")) as { id: string };
  await messageAction(ra.id, "approve", null, "admin:test");
  assert.equal(world.sent.length, 2);
  assert.equal(world.sent[1].sid, a.crisp_session);
  assert.ok((await status("alpha.myshopify.com")).review_asked_at);

  // upgrade seen on AC2
  world.stores["alpha.myshopify.com"] = store("alpha.myshopify.com", { pageflyPlan: "Pay as you go", pageflyPrice: 24, totalPages: 5 });
  await customerAction("alpha.myshopify.com", "recheck", {}, "admin:test");
  const a3 = await status("alpha.myshopify.com");
  assert.ok(a3.upgraded_at && a3.pages_updated_at);
  assert.equal(a3.needs_check, false, "the same reply read again is not a new one");

  // auto mode: a new customer is sent at once; an old select is only eligible
  await saveSsuSettings({ mode: "auto" });
  world.events.push(ev("eps.myshopify.com", "owner@eps.myshopify.com", "nordlys", 0));
  world.events.push(ev("old.myshopify.com", "owner@old.myshopify.com", "nordlys", 60 * 24 * 5));
  world.stores["eps.myshopify.com"] = store("eps.myshopify.com");
  world.stores["old.myshopify.com"] = store("old.myshopify.com");
  await p.query("delete from ssu_settings where key = '_cursor'");
  r = await runJob();
  assert.equal((await status("eps.myshopify.com")).status, "sent");
  assert.equal((await status("old.myshopify.com")).status, "eligible");
  assert.equal(world.sent.length, 3);

  const counts = await ssuCounts();
  assert.equal(counts.sent, 2);
  assert.equal(counts.reviewed, 2);
  console.log("store set upsell: all checks passed", JSON.stringify(counts));
  await (await import("../lib/upsell/db")).closeUpsellPool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
