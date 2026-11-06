/* ==========================================================================
   Upsell Collection Pages 2 — the sheet rows n8n posts, the /go click, the
   tracking (Crisp, AC2, Collection pages downloads) and what goes back to the
   sheet, against a real Postgres with Crisp and AC2 answered by a stub.

       UCP2_TEST_DATABASE_URL=postgres://postgres@localhost:5432/ucp2_test \
         npx tsx scripts/test-ucp2.ts

   THE DATABASE IS WIPED — every ucp2_* table is dropped first.
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

const url = process.env.UCP2_TEST_DATABASE_URL;
if (!url) {
  console.log("UCP2_TEST_DATABASE_URL is not set — skipping (this test needs a throwaway Postgres).");
  process.exit(0);
}
for (const k of Object.keys(process.env)) if (/^postgres(ql)?:\/\//.test(process.env[k] ?? "")) delete process.env[k];
process.env.DATABASE_URL = url;
process.env.UCP2_DISABLE_TIMER = "1";
process.env.SSU_DISABLE_TIMER = "1";
process.env.UPSELL_DISABLE_TIMER = "1";
process.env.CRISP_IDENTIFIER = "crisp-id";
process.env.CRISP_KEY = "crisp-key";
process.env.N8N_AC2_URL = "https://n8n.test/webhook/ac2";
process.env.N8N_AC2_KEY = "bpu-key";
process.env.UPSELL_API_KEY = "test-key-0123456789abcdef";

const S1 = "session_11111111-1111-4111-8111-111111111111";
const S2 = "session_22222222-2222-4222-8222-222222222222";
const S3 = "session_33333333-3333-4333-8333-333333333333";
const S4 = "session_44444444-4444-4444-8444-444444444444";

const world = {
  messages: {} as Record<string, Record<string, unknown>[]>,
  reviews: {} as Record<string, number>,
  stores: {} as Record<string, Record<string, unknown>>,
  activities: {} as Record<string, { type: string; occurredAt: string }[]>,
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  if (u.host === "n8n.test") {
    const path = u.searchParams.get("path")!;
    const acts = path.match(/^\/([^/]+)\/activities$/);
    if (acts) return reply({ items: world.activities[decodeURIComponent(acts[1])] ?? [] });
    const d = decodeURIComponent(path.slice(1));
    return world.stores[d] ? reply(world.stores[d]) : reply({}, 404);
  }
  if (u.host === "api.crisp.chat") {
    const path = u.pathname.replace(/^\/v1\/website\/[^/]+/, "");
    let m;
    if ((m = path.match(/^\/conversation\/([^/]+)\/messages$/))) return reply({ error: false, data: world.messages[m[1]] ?? [] });
    if (path.match(/^\/conversations\/\d+$/)) {
      const q = u.searchParams.get("search_query") ?? "";
      const r = world.reviews[q];
      return reply({ error: false, data: r === undefined ? [] : [{ session_id: `session_r_${q}`, meta: { email: q, data: { app_review: r } } }] });
    }
    if (path.startsWith("/people/data/")) return reply({ error: true, reason: "people_not_found" }, 404);
  }
  throw new Error(`unexpected fetch ${init?.method ?? "GET"} ${u}`);
}) as typeof fetch;

const vn = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "medium" }).format(d).replace(/^(\d{4}-\d{2}-\d{2}) 0?/, "$1 ");

async function main() {
  const dbm = await import("../lib/ucp2/db");
  const p = await dbm.db();
  await p.query("drop table if exists ucp2_rows, ucp2_events, ucp2_state, collection_leads cascade");
  dbm.resetUcp2Schema();
  await dbm.db();
  await p.query("create table collection_leads (id text primary key, set_slug text, set_name text, page_slug text, domain text, email text, visitor_id text, country text, created_at timestamptz default now())");

  const core = await import("../lib/ucp2/core");
  const q = await import("../lib/ucp2/queries");
  const route = await import("../app/api/ucp2/rows/route");
  const go = await import("../app/go/[code]/route");

  // ---- the sheet's time is Vietnam time
  assert.equal(core.sheetTime("2026-10-05 8:00:28"), "2026-10-05T01:00:28.000Z");
  assert.equal(core.sessionOf("https://app.crisp.chat/website/x/inbox/session_9046863A-2d75-4b19-8120-157bd39afe35/"), "session_9046863a-2d75-4b19-8120-157bd39afe35");

  // ---- import: n8n posts the rows as the Sheets node gives them
  const sent = new Date(Date.now() - 3 * 86_400_000);
  const rows = [
    { "Time": vn(sent), "Code Store": "PDAAA111", "Store Domain": "alpha.myshopify.com", "Email": "a@alpha.com", "Tên store": "Alpha", "Plan": "Free", "Ticket": `https://app.crisp.chat/website/w/inbox/${S1}/`, "Type User": "Resolved - Collection Pages" },
    { "Time": vn(sent), "Code Store": "beta-1", "Store Domain": "Beta-1.myshopify.com", "Email": "b@beta.com", "Tên store": "Beta", "Plan": "Free", "Ticket": `https://app.crisp.chat/website/w/inbox/${S2}`, "Type User": "New install - Collection Pages" },
    { "Time": vn(new Date()), "Code Store": "gamma", "Store Domain": "gamma.myshopify.com", "Email": "c@gamma.com", "Tên store": "Gamma", "Plan": "Free", "Ticket": `https://app.crisp.chat/website/w/inbox/${S3}`, "Type User": "New install - Collection Pages" },
    { "Time": vn(sent), "Code Store": "delta", "Store Domain": "delta.myshopify.com", "Email": "d@delta.com", "Tên store": "Delta", "Plan": "Free", "Ticket": `https://app.crisp.chat/website/w/inbox/${S4}`, "Type User": "Resolved - Collection Pages" },
    { "Time": vn(sent), "Store Domain": "noticket.myshopify.com", "Ticket": "" },
  ];
  const post = (body: unknown, key = "test-key-0123456789abcdef") =>
    route.POST(new Request("https://x/api/ucp2/rows", { method: "POST", headers: { "x-api-key": key, "content-type": "application/json" }, body: JSON.stringify(body) }));
  assert.equal((await post(rows, "wrong-key-0123456789")).status, 401, "a wrong key is refused");
  let r = await (await post(rows)).json();
  assert.deepEqual([r.received, r.added, r.updated, r.skipped.length], [5, 4, 0, 1], JSON.stringify(r));
  assert.match(r.skipped[0].reason, /session/);
  r = await (await post({ rows })).json();
  assert.deepEqual([r.added, r.updated], [0, 0], "posting the same tab again changes nothing");
  r = await (await post([{ ...rows[0], "Tên store": "Alpha Co" }])).json();
  assert.deepEqual([r.added, r.updated], [0, 1], "a changed cell updates its row");
  const beta = (await p.query("select * from ucp2_rows where session_id = $1", [S2])).rows[0];
  assert.equal(beta.store_domain, "beta-1.myshopify.com", "the domain is kept lower case");

  // ---- the click: counted on the row, then on to the page; a preview bot is not a click
  const click = (path: string, ua = "Mozilla/5.0 (Macintosh)") => go.GET(new Request(`https://x${path}`, { headers: { "user-agent": ua } }), { params: Promise.resolve({ code: path.split("/")[2].split("?")[0] }) } as never);
  let res = await click("/go/PDAAA111");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/collection-pages");
  res = await click("/go/pdaaa111?to=https://free-service.pagefly.io/?s=alpha");
  assert.equal(res.headers.get("location"), "https://free-service.pagefly.io/?s=alpha");
  res = await click("/go/PDAAA111?to=https://evil.example/x");
  assert.equal(res.headers.get("location"), "/collection-pages", "only pagefly.io addresses are followed");
  res = await click("/go/PDAAA111?to=//evil.example/x");
  assert.equal(res.headers.get("location"), "/collection-pages", "a protocol-relative path is not this site");
  await click("/go/PDAAA111", "Slackbot-LinkExpanding 1.0");
  res = await click("/go/nobody");
  assert.equal(res.status, 302, "an unknown code still goes on");
  const alpha0 = (await p.query("select clicks, clicked_at from ucp2_rows where session_id = $1", [S1])).rows[0];
  assert.equal(alpha0.clicks, 4, "four clicks from a person, none from the preview bot");
  assert.ok(alpha0.clicked_at);
  await click("/go/beta-1");
  assert.equal((await p.query("select clicks from ucp2_rows where session_id = $1", [S2])).rows[0].clicks, 1, "the domain's name works as a code");

  // ---- tracking: read, replies, review, upgrade, download, uninstall
  const t0 = sent.getTime();
  world.messages[S1] = [
    { type: "text", from: "user", content: "old question", timestamp: t0 - 86_400_000 },
    { type: "text", from: "operator", content: "invite", timestamp: t0 + 1000, delivered: "x", read: "x" },
    { type: "text", from: "user", content: "I love this, can you help?", timestamp: t0 + 3_600_000 },
  ];
  world.messages[S2] = [{ type: "text", from: "operator", content: "invite", timestamp: t0 + 1000, delivered: "x" }];
  world.messages[S3] = [{ type: "text", from: "operator", content: "invite", timestamp: Date.now() }];
  world.reviews["a@alpha.com"] = 5;
  world.reviews["c@gamma.com"] = 5;
  world.stores["alpha.myshopify.com"] = { shopDomain: "alpha.myshopify.com", pageflyPlan: "Pro", pageflyPrice: 39, status: "installed" };
  world.activities["alpha.myshopify.com"] = [{ type: "SUBSCRIPTION_CHARGE_ACTIVATED", occurredAt: new Date(t0 + 7_200_000).toISOString() }];
  world.stores["beta-1.myshopify.com"] = { shopDomain: "beta-1.myshopify.com", pageflyPlan: "Free", pageflyPrice: 0, status: "uninstalled", uninstalledAt: new Date(t0 + 86_400_000).toISOString() };
  world.messages[S4] = [];
  // paying for a long time, though the sheet says Free: no charge after the message
  world.stores["delta.myshopify.com"] = { shopDomain: "delta.myshopify.com", pageflyPlan: "Silver", pageflyPrice: 19, status: "installed" };
  world.activities["delta.myshopify.com"] = [{ type: "SUBSCRIPTION_CHARGE_ACTIVATED", occurredAt: new Date(t0 - 300 * 86_400_000).toISOString() }];
  world.stores["gamma.myshopify.com"] = { shopDomain: "gamma.myshopify.com", pageflyPlan: "Free", pageflyPrice: 0, status: "installed" };
  await p.query("insert into collection_leads (id, domain, email, created_at) values ('l1', 'Alpha.myshopify.com', 'a@alpha.com', $1), ('l0', 'beta-1.myshopify.com', 'b@beta.com', $2)", [
    new Date(t0 + 5_000_000).toISOString(),
    new Date(t0 - 5_000_000).toISOString(),
  ]);

  const job = await core.runTrack();
  assert.equal(job.tracked, 4, JSON.stringify(job));
  assert.deepEqual(job.errors, []);
  const get = async (s: string) => (await p.query("select * from ucp2_rows where session_id = $1", [s])).rows[0];
  const a = await get(S1);
  assert.ok(a.delivered_at && a.read_at, "read on Crisp");
  assert.equal(a.replies, 1, "only what they wrote after the invite");
  assert.match(a.last_reply_text, /I love this/);
  assert.equal(Math.floor(new Date(a.upgraded_at).getTime() / 1000), Math.floor((t0 + 7_200_000) / 1000), "upgraded at AC2's charge time");
  assert.equal(a.upgraded_to, "Pro");
  assert.ok(a.reviewed_at, "5★ found three days after the invite: counted");
  assert.ok(a.downloaded_at, "a Collection pages download after the invite");
  const b = await get(S2);
  assert.ok(b.delivered_at && !b.read_at, "delivered, not read");
  assert.ok(!b.downloaded_at, "a download before the invite is not counted");
  assert.ok(b.uninstalled_at, "uninstalled after the invite");
  const dl = await get(S4);
  assert.ok(!dl.upgraded_at, "paid since long before the message: not an upgrade");
  assert.equal(Number(dl.first_price), 19);
  const g = await get(S3);
  assert.ok(!g.reviewed_at && g.reviewed_before, "5★ at the first look, the day it went: from before");
  assert.equal(Number(g.first_price), 0, "AC2's price at the first look is kept");
  world.stores["gamma.myshopify.com"] = { ...world.stores["gamma.myshopify.com"], pageflyPlan: "Builder", pageflyPrice: 24 };
  await core.trackOne((await get(S3)) as never, { force: true });
  assert.ok((await get(S3)).upgraded_at, "on Free at AC2's first look the day it went, paid now: an upgrade");
  await p.query("update ucp2_rows set upgraded_at = null, upgraded_to = null, upgraded_price = null where session_id = $1", [S3]);
  await p.query("delete from ucp2_events where session_id = $1 and type = 'upgraded'", [S3]);
  world.stores["gamma.myshopify.com"] = { ...world.stores["gamma.myshopify.com"], pageflyPlan: "Free", pageflyPrice: 0 };

  // a second run does not log the same things again
  await p.query("update ucp2_rows set tracked_at = null, crisp_checked_at = null");
  await core.runTrack();
  const ev = (await p.query("select type, count(*)::int as n from ucp2_events where session_id = $1 group by type", [S1])).rows;
  for (const e of ev) assert.ok(e.type === "clicked" || e.n === 1, `${e.type} logged once (${e.n})`);

  // ---- the screen's numbers
  const st = await q.ucp2Stats({});
  assert.deepEqual(
    [st.all.sent, st.all.read, st.all.clicked, st.all.downloaded, st.all.replied, st.all.upgraded, st.all.reviewed, st.all.uninstalled, st.all.clicks],
    [4, 1, 2, 1, 1, 1, 1, 1, 5],
    JSON.stringify(st.all),
  );
  assert.equal(st.all.mrr, 39);
  assert.equal(st.byType.reduce((n, t) => n + t.sent, 0), 4);
  assert.equal(st.byType.find((t) => t.type === "New install - Collection Pages")?.sent, 2);
  for (const did of Object.keys(q.UCP2_DID)) {
    const l = await q.ucp2List({ did });
    const want = did === "not_read" ? 4 - st.all.read : st.all[did as keyof typeof st.all];
    assert.equal(l.total, want, `list · ${did}`);
  }
  assert.equal((await q.ucp2List({ q: "pdaaa" })).total, 1, "search by code");
  assert.equal((await q.ucp2List({ type: "Resolved - Collection Pages" })).total, 2);

  // ---- back to the sheet: every row, or those changed since
  const pull = (since?: string) => route.GET(new Request(`https://x/api/ucp2/rows${since ? `?since=${encodeURIComponent(since)}` : ""}`, { headers: { "x-api-key": "test-key-0123456789abcdef" } }));
  const all = await (await pull()).json();
  assert.equal(all.rows.length, 4);
  assert.deepEqual(all.columns, [...core.SHEET_COLUMNS]);
  const ra = all.rows.find((x: { session_id: string }) => x.session_id === S1);
  assert.equal(ra.Ticket, `https://app.crisp.chat/website/w/inbox/${S1}/`, "keyed by the Ticket as the sheet has it");
  assert.match(ra["PFD Đã đọc"], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(ra["PFD Số click"], "4");
  assert.match(ra["PFD Nâng cấp"], /Pro \$39/);
  assert.match(ra["PFD Review"], /5★/);
  assert.equal(all.rows.find((x: { session_id: string }) => x.session_id === S3)["PFD Review"], "5★");
  const later = new Date(Date.now() + 1000).toISOString();
  assert.equal((await (await pull(later)).json()).rows.length, 0, "nothing changed since");
  await new Promise((res) => setTimeout(res, 1100));
  await click("/go/gamma");
  assert.deepEqual(
    (await (await pull(later)).json()).rows.map((x: { session_id: string }) => x.session_id),
    [S3],
    "a click moves only its row into ?since",
  );

  console.log("ucp2: all checks passed");
  await (await import("../lib/upsell/db")).closeUpsellPool();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
