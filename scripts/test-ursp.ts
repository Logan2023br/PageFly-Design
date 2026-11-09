/* ==========================================================================
   Upsell Responsive — Recap rows in (only new ones, Haiku on the category,
   the resolution rule), Active stores from AC2, the store rules, sending into
   the right conversation, the reply (note mentioning Logan, Haiku's read),
   Đã xử lý xong, upgrade / review after it, the stats, and Tạm dừng.
   Crisp, AC2 and Anthropic are faked; nothing leaves the machine.

       URSP_TEST_DATABASE_URL=postgres://postgres@localhost:5432/ursp_test \
         npx tsx scripts/test-ursp.ts

   THE DATABASE'S ursp_* TABLES ARE DROPPED FIRST.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

const url = process.env.URSP_TEST_DATABASE_URL;
if (!url) {
  console.log("URSP_TEST_DATABASE_URL is not set — skipping (this test needs a throwaway Postgres).");
  process.exit(0);
}
for (const k of Object.keys(process.env)) if (/^postgres(ql)?:\/\//.test(process.env[k] ?? "")) delete process.env[k];
Object.assign(process.env, {
  DATABASE_URL: url,
  URSP_DISABLE_TIMER: "1",
  UCP2_DISABLE_TIMER: "1",
  SSU_DISABLE_TIMER: "1",
  UPSELL_DISABLE_TIMER: "1",
  REPORTS_DISABLE_TIMER: "1",
  CRISP_IDENTIFIER: "id-test",
  CRISP_KEY: "key-test",
  CRISP_WEBSITE_ID: "web-1",
  N8N_AC2_URL: "https://n8n.test/ac2",
  N8N_AC2_KEY: "ac2-key",
  ANTHROPIC_API_KEY: "sk-test",
});
delete process.env.SHEET_SERVICE_ACCOUNT_JSON;
delete process.env.URSP_SHEET_SA_JSON;
delete process.env.GOOGLE_SA_JSON;

let failed = 0;
function check(ok: unknown, what: string, detail?: unknown) {
  if (ok) console.log(`  ✓ ${what}`);
  else {
    failed++;
    console.log(`  ✗ ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

/* ---------------------------------------------------------------- fakes */

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const vnStamp = (ms: number) => {
  const d = new Date(ms + 7 * 3_600_000);
  return d.toISOString().slice(0, 16).replace("T", " ");
};

type Store = Record<string, unknown>;
const ac2: Record<string, Store> = {};
const activities: Record<string, { type: string; occurredAt: string }[]> = {};
const store = (d: string, o: Store = {}) =>
  (ac2[d] = { shopDomain: d, name: d.split(".")[0], email: `${d.split(".")[0]}@x.test`, shopifyPlan: "Basic", pageflyPlan: "Free", pageflyPrice: 0, numPublished: 3, status: "installed", ...o });

type Msg = { type: string; from: "user" | "operator"; content: unknown; timestamp: number; read?: string; delivered?: string; mentions?: string[]; user?: unknown };
const convs: Record<string, { email?: string; updated_at: number; msgs: Msg[]; state?: string; segments: string[] }> = {};
let created = 0;
const conv = (sid: string, email: string | undefined, updatedAt: number, msgs: Msg[] = []) => (convs[sid] = { email, updated_at: updatedAt, msgs, segments: [] });
const reviews: Record<string, number> = {};
let haikuCalls = 0;
const sheetRanges: string[] = [];
let sheetValues: string[][] = [];

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const method = (init?.method ?? "GET").toUpperCase();
  /* Google's token request is a form, the rest JSON */
  const body = init?.body && String(init.body).trim().startsWith("{") ? JSON.parse(String(init.body)) : null;

  if (u.hostname === "api.anthropic.com") {
    haikuCalls++;
    const prompt: string = body.messages[0].content;
    if (prompt.includes("tag each ticket with a category")) {
      const cats = [...prompt.matchAll(/^- (".*")$/gm)].map((m) => JSON.parse(m[1]) as string);
      return reply({ content: [{ type: "text", text: JSON.stringify(Object.fromEntries(cats.map((c) => [c, /respons|repons|mobile/i.test(c)]))) }] });
    }
    return reply({ content: [{ type: "text", text: '{"intent":"agree","mood":"happy","note":"Khách đồng ý, nhờ check trang chủ"}' }] });
  }

  if (u.hostname === "oauth2.googleapis.com") return reply({ access_token: "tok" });
  if (u.hostname === "sheets.googleapis.com") {
    const range = decodeURIComponent(u.pathname.split("/values/")[1] ?? "");
    sheetRanges.push(range);
    return reply({ values: sheetValues });
  }

  if (u.hostname === "n8n.test") {
    const path = u.searchParams.get("path") ?? "";
    if (path === "") return reply({ items: Object.values(ac2) });
    const [, d, sub] = path.split("/");
    const dom = decodeURIComponent(d);
    if (sub === "activities") return reply({ items: activities[dom] ?? [] });
    return ac2[dom] ? reply(ac2[dom]) : reply({}, 404);
  }

  if (u.hostname === "api.crisp.chat") {
    const p = u.pathname.replace(/^\/v1\/website\/[^/]+/, "");
    let m: RegExpMatchArray | null;
    if (p === "/operators/list") return reply({ data: [{ details: { user_id: "u-logan", first_name: "Logan" } }] });
    if ((m = p.match(/^\/conversations\/(\d+)$/))) {
      const q = (u.searchParams.get("search_query") ?? "").toLowerCase();
      const list = Object.entries(convs)
        .filter(([, c]) => c.email === q)
        .map(([sid, c]) => ({ session_id: sid, updated_at: c.updated_at, meta: { email: c.email, data: {} } }));
      return reply({ data: m[1] === "1" ? list : [] });
    }
    if ((m = p.match(/^\/people\/data\/(.+)$/))) return reply({ data: { data: { app_review: reviews[decodeURIComponent(m[1])] ?? null } } });
    if (p === "/conversation" && method === "POST") {
      const sid = `session_00000000-0000-0000-0000-${String(++created).padStart(12, "0")}`;
      conv(sid, undefined, now);
      return reply({ data: { session_id: sid } });
    }
    if ((m = p.match(/^\/conversation\/([^/]+)\/(meta|state|message|messages)$/))) {
      const c = convs[m[1]];
      if (!c) return reply({ error: true, reason: "not found" }, 404);
      if (m[2] === "meta" && method === "PATCH") {
        if (body.email) c.email = body.email;
        if (body.segments) c.segments = body.segments;
        return reply({ data: {} });
      }
      if (m[2] === "meta") return reply({ data: { segments: c.segments, data: {} } });
      if (m[2] === "state") {
        c.state = body.state;
        return reply({ data: {} });
      }
      if (m[2] === "message") {
        c.msgs.push({ type: body.type, from: body.from, content: body.content, timestamp: Date.now(), mentions: body.mentions, user: body.user });
        return reply({ data: {} });
      }
      return reply({ data: c.msgs });
    }
    return reply({ error: true, reason: `unfaked ${method} ${p}` }, 404);
  }
  throw new Error(`unfaked fetch ${u.href}`);
}) as typeof fetch;

/* ---------------------------------------------------------------- run */

async function main() {
  const { Pool } = await import("pg");
  const raw = new Pool({ connectionString: url });
  const { rows: tables } = await raw.query<{ t: string }>("select tablename as t from pg_tables where schemaname = 'public' and tablename like 'ursp\\_%'");
  if (tables.length) await raw.query(`drop table if exists ${tables.map((r) => r.t).join(", ")} cascade`);
  await raw.end();

  const core = await import("../lib/ursp/core");
  const settings = await import("../lib/ursp/settings");
  const queries = await import("../lib/ursp/queries");
  const p = await (await import("../lib/ursp/db")).db();
  const target = async (seg: string, d: string) =>
    (await p.query("select * from ursp_targets where segment = $1 and store_domain = $2", [seg, d])).rows[0] as import("../lib/ursp/types").UrspTarget | undefined;

  console.log("rules");
  check(core.shopifyUnpaid("partner_test") && core.shopifyUnpaid("Development") && core.shopifyUnpaid("") && core.shopifyUnpaid("trial"), "dev / partner / trial / empty Shopify plans are unpaid");
  check(!core.shopifyUnpaid("Basic") && !core.shopifyUnpaid("Grow") && !core.shopifyUnpaid("shopify_plus"), "Basic / Grow / Plus are paid");
  const cfg0 = await settings.getUrspSettings();
  check(core.resolutionSkipped("Đợi TS check ", cfg0) && core.resolutionSkipped("het ca chua giai quyet", cfg0), "resolution rule ignores spaces, case and accents");
  check(!core.resolutionSkipped("Chờ khách phản hồi", cfg0), "other resolutions pass");
  check(core.endDateText("2026-11-30") === "November 30", "end date reads November 30");

  console.log("paused");
  const row = (o: Record<string, string>) => ({
    recap_at_vn: vnStamp(now),
    store_domain: "",
    category_issue: "Mobile/Responsive",
    resolution: "Đã resolved",
    session_id: "",
    ticket_url: "",
    num_pages_publish: "3",
    shopify_plan: "Basic",
    name_pic: "Eli",
    issue_summary: "Mobile layout broken",
    ...o,
  });
  const before = await core.importRecap([row({ store_domain: "early.myshopify.com", session_id: "session_aaaaaaaa-0000-0000-0000-000000000001" })]);
  check(before.added === 0 && /tạm dừng/i.test(before.note ?? ""), "nothing is taken while paused", before);
  check((await core.runJob(true)) === null, "the job does nothing while paused");

  await settings.setRunning(true, "admin:test");
  const run = await settings.runState();

  console.log("recap (only responsive)");
  check(cfg0.recap_only_responsive === 0, "by default every Recap row is taken");
  await settings.saveUrspSettings({ recap_only_responsive: 1, ab_split: 0 });
  const sid = (n: number) => `session_aaaaaaaa-0000-0000-0000-${String(n).padStart(12, "0")}`;
  for (const [d, o] of [
    ["good.myshopify.com", {}],
    ["spell.myshopify.com", {}],
    ["waits.myshopify.com", {}],
    ["big.myshopify.com", { numPublished: 25 }],
    ["dev.myshopify.com", { shopifyPlan: "partner_test" }],
    ["gone.myshopify.com", { status: "uninstalled" }],
    ["busy.myshopify.com", {}],
  ] as const)
    store(d, o);
  conv(sid(1), "good@x.test", now - 3 * 3_600_000, [{ type: "text", from: "user", content: "help", timestamp: now - 3 * 3_600_000 }]);
  conv(sid(2), "spell@x.test", now - 3 * 3_600_000);
  conv(sid(7), "busy@x.test", now - 60_000, [{ type: "text", from: "operator", content: "checking", timestamp: now - 60_000 }]);
  const res = await core.importRecap([
    row({ recap_at_vn: vnStamp(new Date(run.started_at!).getTime() - 3_600_000), store_domain: "old.myshopify.com", session_id: sid(9) }),
    row({ store_domain: "good.myshopify.com", session_id: sid(1) }),
    row({ store_domain: "spell.myshopify.com", session_id: sid(2), category_issue: "Reponsive mobile" }),
    row({ store_domain: "waits.myshopify.com", session_id: sid(3), resolution: "Đợi TS check " }),
    row({ store_domain: "big.myshopify.com", session_id: sid(4) }),
    row({ store_domain: "dev.myshopify.com", session_id: sid(5) }),
    row({ store_domain: "gone.myshopify.com", session_id: sid(6) }),
    row({ store_domain: "busy.myshopify.com", session_id: sid(7) }),
    row({ store_domain: "other.myshopify.com", session_id: sid(8), category_issue: "Publish" }),
    row({ store_domain: "", session_id: sid(10) }),
  ]);
  check(res.added === 9, "the row from before Bắt đầu is not taken", res);
  check(res.responsive === 8, "Haiku: Mobile/Responsive and 'Reponsive mobile' are responsive, Publish is not", res);
  const cats = (await p.query("select category, responsive, by from ursp_categories order by 1")).rows;
  check(cats.length === 3 && cats.every((c) => c.by === "haiku"), "each spelling asked once and kept", cats);
  check((await target("recap", "good.myshopify.com"))?.status === "approved", "a qualifying store is queued (auto)");
  check((await target("recap", "spell.myshopify.com"))?.status === "approved", "an odd spelling still qualifies");
  const skipCode = async (d: string) => (await target("recap", d))?.skip_code;
  check((await skipCode("waits.myshopify.com")) === "resolution", "Đợi TS check is left out");
  check((await skipCode("big.myshopify.com")) === "too_many_pages", "25 published pages is left out");
  check((await skipCode("dev.myshopify.com")) === "shopify_unpaid", "a partner store is left out");
  check((await skipCode("gone.myshopify.com")) === "uninstalled", "an uninstalled store is left out");
  check((await skipCode(`(không domain) ${sid(10)}`)) === "no_domain", "a row without a domain is kept as left out");
  check(!(await target("recap", "other.myshopify.com")), "a non-responsive row is no target");

  const again = await core.importRecap([row({ store_domain: "good.myshopify.com", session_id: sid(1) })]);
  check(again.added === 0, "the same row posted again is taken once");

  console.log("send");
  const job = await core.runJob(true);
  check(job && job.sent >= 2, "the job sends", job);
  const good = await target("recap", "good.myshopify.com");
  check(good?.status === "sent" && good.session_id === sid(1), "Recap is sent in its own ticket", good?.status);
  const texts = convs[sid(1)].msgs.filter((m) => m.from === "operator" && m.type === "text");
  const offer = String(texts[0]?.content ?? "");
  const day3 = core.deadlineText(new Date(Date.now() + 3 * 86_400_000));
  check(texts.length === 1 && offer.includes("**3 DAYS only**") && offer.includes(`**${day3}**`), "the offer lasts 3 days, its last day written in, bold", offer.match(/valid.*$/m)?.[0]);
  check(offer.startsWith("Hi **GOOD** team") && offer.includes("This is **LOGAN**") && offer.includes("**LOGAN** – PageFly"), "the customer's name and Logan's are bold capitals");
  check(!offer.includes("{deadline}") && !offer.includes("{offer_days}"), "no placeholder left");
  check(!/(^|[^*])\*[^*\s][^*\n]*[^*\s]\*(?!\*)/.test(offer.replace(/\*\*[^*\n]+\*\*/g, "")), "no single-* (italic on Crisp) left");
  const goodRow = await target("recap", "good.myshopify.com");
  check(goodRow?.offer_until && Math.abs(new Date(goodRow.offer_until).getTime() - Date.now() - 3 * 86_400_000) < 120_000, "offer_until is kept: 3 days from sending");
  check(convs[sid(1)].msgs.some((m) => m.type === "note" && String(m.content).includes("mention Logan")), "a private note says to mention Logan on a reply");
  check(convs[sid(1)].state === "resolved", "the ticket is resolved after");
  check(convs[sid(1)].segments.includes("upsell-responsive"), "the Crisp segment is added");
  check(created === 0, "no new conversation for Recap");
  const busy = await target("recap", "busy.myshopify.com");
  check(busy?.status === "approved" && busy.wait_until, "a ticket with a message a minute ago waits", busy?.status);

  console.log("active");
  const today = iso(now - 60_000);
  store("fresh.myshopify.com", { lastActiveAt: today });
  store("returning.myshopify.com", { lastActiveAt: today });
  store("talking.myshopify.com", { lastActiveAt: today });
  store("yesterday.myshopify.com", { lastActiveAt: iso(now - 2 * 86_400_000) });
  ac2["good.myshopify.com"].lastActiveAt = today;
  conv("session_bbbbbbbb-0000-0000-0000-000000000001", "returning@x.test", now - 60 * 86_400_000);
  conv("session_bbbbbbbb-0000-0000-0000-000000000002", "talking@x.test", now - 2 * 86_400_000);
  await p.query("delete from ursp_state where key = 'active'");
  await core.runJob(true);
  const scan = await (await import("../lib/ursp/db")).getState<import("../lib/ursp/core").ActiveResult>("active");
  check(scan?.field === "lastActiveAt" && scan.active_today === 4, "active today found by lastActiveAt", scan);
  check(scan?.looked === 3, "a store already messaged is not looked at again", scan);
  check(!(await target("active", "yesterday.myshopify.com")), "a store active yesterday is not taken");
  check((await target("active", "talking.myshopify.com"))?.session_id === "session_bbbbbbbb-0000-0000-0000-000000000002", "talked to support 2 days ago: still sent, in that conversation");
  /* that conversation's last message is 2 days old: no wait for it to go quiet */
  convs["session_bbbbbbbb-0000-0000-0000-000000000002"].msgs.push({ type: "text", from: "user", content: "old question", timestamp: now - 2 * 86_400_000 });
  await core.runJob(true);
  const fresh = await target("active", "fresh.myshopify.com");
  check(fresh?.status === "sent" && created === 1 && convs[fresh.session_id!]?.email === "fresh@x.test", "no conversation before: a new one is opened", { s: fresh?.status, created });
  const ret = await target("active", "returning.myshopify.com");
  check(ret?.status === "sent" && ret.session_id === "session_bbbbbbbb-0000-0000-0000-000000000001", "an older conversation: the message goes there", ret?.session_id);

  console.log("reply, handled, outcome");
  await p.query("update ursp_targets set tracked_at = null, crisp_checked_at = null where segment = 'recap' and store_domain = 'good.myshopify.com'");
  convs[sid(1)].msgs.forEach((m) => {
    if (m.from === "operator") m.read = "chat";
  });
  convs[sid(1)].msgs.push({ type: "text", from: "user", content: "Yes please, check my home page", timestamp: Date.now() + 1000 });
  const t1 = (await target("recap", "good.myshopify.com"))!;
  await core.trackOne(t1, await settings.getUrspSettings());
  const t2 = (await target("recap", "good.myshopify.com"))!;
  check(t2.read_at && t2.replied_at && t2.replies === 1, "read and the reply are seen");
  check(t2.reply_intent === "agree" && t2.mood === "happy", "Haiku reads the reply: agrees, happy", { i: t2.reply_intent, m: t2.mood });
  const mention = convs[sid(1)].msgs.find((m) => m.type === "note" && m.mentions?.includes("u-logan"));
  check(mention && String(mention.content).includes("@Logan"), "a note mentions Logan (his Crisp user id)");
  check(t2.first_review === 0, "the review baseline is taken at the first look");

  await core.targetAction(t2.id, "done", "tu");
  const t3 = (await target("recap", "good.myshopify.com"))!;
  check(t3.done_at && t3.done_by === "tu", "Đã xử lý xong keeps who and when");

  ac2["good.myshopify.com"].pageflyPlan = "Builder";
  ac2["good.myshopify.com"].pageflyPrice = 24;
  activities["good.myshopify.com"] = [{ type: "SUBSCRIPTION_CHARGE_ACTIVATED", occurredAt: iso(Date.now() + 5000) }];
  reviews["good@x.test"] = 5;
  await core.trackOne(t3, await settings.getUrspSettings(), { force: true });
  const t4 = (await target("recap", "good.myshopify.com"))!;
  check(t4.upgraded_at && Number(t4.upgraded_price) === 24, "the upgrade after it is seen");
  check(t4.reviewed_at && t4.app_review === 5, "the 5★ review after it is seen");

  console.log("notifications");
  {
    const { recentNotices } = await import("../lib/adminNotifications");
    const ns = await recentNotices(["ursp"]);
    const mine = ns.filter((n) => n.id.includes("good.myshopify.com"));
    check(mine.some((n) => n.tone === "reply" && /Upsell Responsive: khách GOOD|Upsell Responsive: khách good/.test(n.text)), "a reply is announced", mine.map((n) => n.text));
    check(mine.some((n) => n.id.startsWith("ursp-agree:") && n.tone === "celebrate"), "an agreement is celebrated");
    check(mine.some((n) => n.id.startsWith("ursp-up:")) && mine.some((n) => n.id.startsWith("ursp-review:")), "upgrade and review are announced");
    check(mine.every((n) => n.href?.startsWith("/design/admin/responsive?tab=")), "each opens the store on the screen");
    check((await recentNotices(["ssu"])).every((n) => !n.id.startsWith("ursp")), "only for accounts with Upsell Responsive");
  }

  console.log("stats");
  const s = await queries.segmentStats({});
  check(s.recap.rows === 9 && s.recap.responsive === 8, "Recap: rows read and responsive", s.recap);
  check(s.recap.found === 8 && s.recap.skipped === 5, "Recap: stores found and left out", { f: s.recap.found, s: s.recap.skipped });
  check(s.recap.reasons.length === 5 && s.recap.reasons.every((r) => r.n === 1), "Recap: one per reason", s.recap.reasons);
  check(s.recap.agree === 1 && s.recap.done === 1 && s.recap.upgraded_after_done === 1 && s.recap.reviewed_after_done === 1 && s.recap.happy === 1, "Recap: agreed, handled, upgraded and reviewed after", s.recap);
  check(s.active.found === 3 && s.active.sent === 3 && s.active.skipped === 0, "Active: found and sent, none left out", s.active);
  const tc = await queries.tabCounts();
  check(tc.sent === 5 && tc.done === 1, "tab counts", tc);

  console.log("left out under the old rule");
  store("oldrule.myshopify.com");
  await p.query(
    `insert into ursp_targets (segment, store_domain, status, skip_code, skip_reason, source) values ('active', 'oldrule.myshopify.com', 'skipped', 'contacted', 'old', '{}')`,
  );
  await core.runJob(true);
  await core.runJob(true);
  check((await target("active", "oldrule.myshopify.com"))?.status === "sent", "a store once left out for talking to support is looked at again and sent");

  console.log("reminder");
  const spellSid = (await target("recap", "spell.myshopify.com"))!.session_id!;
  convs[spellSid].msgs.forEach((m) => {
    if (m.from === "operator") m.read = "chat";
  });
  await p.query("update ursp_targets set tracked_at = null, crisp_checked_at = null where store_domain = 'spell.myshopify.com'");
  await core.runJob(true);
  check((await target("recap", "spell.myshopify.com"))?.read_at && !(await target("recap", "spell.myshopify.com"))?.followup_status, "read a moment ago: no reminder yet");
  /* a day on: the offer went out 26 hours ago, the conversation has been quiet since */
  convs[spellSid].msgs.forEach((m) => (m.timestamp = Date.now() - 26 * 3_600_000));
  await p.query("update ursp_targets set read_at = now() - interval '25 hours' where store_domain = 'spell.myshopify.com'");
  await core.runJob(true);
  const sp = (await target("recap", "spell.myshopify.com"))!;
  check(sp.followup_status === "sent" && sp.followup_sent_at, "read 25 hours ago, no reply: the reminder goes", sp.followup_status);
  const rem = convs[spellSid].msgs.filter((m) => m.from === "operator" && m.type === "text");
  const reminder = String(rem[1]?.content ?? "");
  check(rem.length === 2 && reminder.includes(`expires on **${core.deadlineText(sp.offer_until!)}**`) && /100% FREE/.test(reminder), "in the same conversation: free, and the day the offer ends", reminder.match(/expires.*$/m)?.[0]);
  check(reminder.startsWith("Hi **SPELL** team") && reminder.includes("from **LOGAN**"), "names bold capitals in the reminder too");
  await core.runJob(true);
  check(convs[spellSid].msgs.filter((m) => m.from === "operator" && m.type === "text").length === 2, "one reminder only");
  check((await target("recap", "good.myshopify.com"))?.followup_status === null, "a store that replied gets no reminder");
  /* sent before offers lasted 3 days: the reminder keeps November */
  await p.query("update ursp_targets set offer_until = null, followup_status = null, followup_sent_at = null where store_domain = 'returning.myshopify.com'");
  const retSid = (await target("active", "returning.myshopify.com"))!.session_id!;
  convs[retSid].msgs.forEach((m) => (m.timestamp = Date.now() - 26 * 3_600_000));
  await p.query("update ursp_targets set read_at = now() - interval '25 hours', tracked_at = now() where store_domain = 'returning.myshopify.com'");
  await core.runJob(true);
  const oldRem = convs[retSid].msgs.filter((m) => m.from === "operator" && m.type === "text").pop();
  check(/in NOVEMBER/.test(String(oldRem?.content)), "an offer sent before the change: its reminder still says November");
  /* the offer ran out: no reminder */
  await p.query("update ursp_targets set offer_until = now() - interval '1 hour', read_at = now() - interval '30 hours', tracked_at = now() where store_domain = 'talking.myshopify.com'");
  await core.runJob(true);
  check((await target("active", "talking.myshopify.com"))?.followup_status === null, "the offer ended: no reminder");
  const s2 = await queries.segmentStats({});
  check(s2.recap.followup_sent === 1, "the reminder is counted", s2.recap.followup_sent);

  console.log("admin");
  const big = (await target("recap", "big.myshopify.com"))!;
  await core.targetAction(big.id, "send_anyway", "tu");
  check((await target("recap", "big.myshopify.com"))?.status === "approved", "Vẫn gửi puts a left-out store in the queue");
  let refused = false;
  try {
    await core.targetAction(big.id, "done", "tu");
  } catch {
    refused = true;
  }
  check(refused, "Đã xử lý xong only on a sent row");
  await settings.saveUrspSettings({ mode: "manual" });
  await p.query("update ursp_targets set read_at = now() - interval '25 hours', tracked_at = now() where store_domain = 'fresh.myshopify.com'");
  await core.runJob(true);
  const fr = (await target("active", "fresh.myshopify.com"))!;
  check(fr.followup_status === "pending", "manual mode: the reminder waits on Chờ duyệt", fr.followup_status);
  check((await queries.listTargets("queue", { status: "pending" })).rows.some((r) => r.id === fr.id), "and is listed under Chờ duyệt");
  await core.targetAction(fr.id, "skip_followup", "tu");
  check((await target("active", "fresh.myshopify.com"))?.followup_status === "skipped", "Không nhắc lại skips only the reminder");
  await core.importRecap([row({ store_domain: "manual.myshopify.com", session_id: sid(11) })]);
  store("manual.myshopify.com");
  await p.query("delete from ursp_targets where store_domain = 'manual.myshopify.com'");
  await p.query("delete from ursp_recap_rows where store_domain = 'manual.myshopify.com'");
  await core.importRecap([row({ store_domain: "manual.myshopify.com", session_id: sid(11) })]);
  check((await target("recap", "manual.myshopify.com"))?.status === "pending", "manual mode: waits on Chờ duyệt");

  console.log("recap (every row, the default)");
  await settings.saveUrspSettings({ recap_only_responsive: 0, mode: "auto" });
  const haikuBefore = haikuCalls;
  store("publish.myshopify.com");
  store("bigpub.myshopify.com", { numPublished: 40 });
  conv(sid(30), "publish@x.test", now - 3 * 86_400_000);
  const every = await core.importRecap([
    row({ store_domain: "publish.myshopify.com", session_id: sid(30), category_issue: "Publish" }),
    row({ store_domain: "bigpub.myshopify.com", session_id: sid(31), category_issue: "Editor" }),
    row({ store_domain: "tsc.myshopify.com", session_id: sid(32), category_issue: "Theme", resolution: "Hết ca chưa giải quyết" }),
  ]);
  check(every.responsive === 3 && haikuCalls === haikuBefore, "every new row is taken, Haiku not asked", every);
  check((await target("recap", "publish.myshopify.com"))?.status === "approved", "a Publish ticket gets the offer");
  check((await target("recap", "bigpub.myshopify.com"))?.skip_code === "too_many_pages", "the store rules still apply (40 pages)");
  check((await target("recap", "tsc.myshopify.com"))?.skip_code === "resolution", "Hết ca chưa giải quyết is still left out");
  await core.runJob(true);
  const pub = convs[sid(30)].msgs.find((m) => m.from === "operator" && m.type === "text");
  check(String(pub?.content).includes("Thank you for reaching out to us recently") && !/how your pages look on mobile/.test(String(pub?.content)), "the Recap offer no longer assumes a mobile ticket");

  console.log("seen filter");
  const seenRows = (await queries.listTargets("sent", { seen: "seen" })).rows;
  check(seenRows.length > 0 && seenRows.every((r) => r.read_at), "Đã xem keeps only rows read", seenRows.length);
  const unseenRows = (await queries.listTargets("sent", { seen: "unseen" })).rows;
  check(unseenRows.length > 0 && unseenRows.every((r) => !r.read_at), "Chưa xem keeps only rows not read", unseenRows.length);
  check((await queries.listTargets("sent", { seen: "followup_sent" })).rows.every((r) => r.followup_sent_at), "Đã nhắc lại keeps only reminded rows");
  check((await queries.listTargets("sent", { seen: "nonsense" })).total === (await queries.listTargets("sent", {})).total, "an unknown key filters nothing");

  console.log("backfill from a date");
  {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const sa = JSON.stringify({ client_email: "t@x.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
    process.env.URSP_SHEET_SA_JSON = Buffer.from(sa).toString("base64");
    const head = ["recap_at_vn", "triggered_by", "store_domain", "pagefly_plan", "pagefly_price", "shopify_plan", "tenure", "app_review", "category_ticket", "category_issue", "issue_summary", "root_cause", "resolution", "escalated", "type_user", "review_verdict", "review_note", "upsell_signal", "churn_risk", "mood_label_end_to_end", "next_action", "session_id", "ticket_url"];
    const line = (at: string, d: string, res: string, s: string) => {
      const r = Array(head.length).fill("");
      r[0] = at; r[2] = d; r[5] = "Basic"; r[9] = "Editor"; r[12] = res; r[21] = s;
      return r;
    };
    store("octold.myshopify.com");
    store("nov1.myshopify.com");
    store("nov2.myshopify.com");
    sheetValues = [
      head,
      line("2026-10-30 10:00", "octold.myshopify.com", "Đã resolved", sid(40)),
      line("2026-11-02 10:00", "nov1.myshopify.com", "Chờ khách phản hồi", sid(41)),
      line("2026-11-03 10:00", "nov2.myshopify.com", "Chờ khách phản hồi", sid(42)),
      line("2026-11-05 10:00", "nov2.myshopify.com", "Đợi TS check", sid(43)),
    ];
    await core.startRecapBackfill("2026-11-01", "admin:tu");
    for (let i = 0; i < 50; i++) {
      const st = await (await import("../lib/ursp/db")).getState<import("../lib/ursp/core").BackfillState>("recap_backfill");
      if (st && !st.running) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const bf = await (await import("../lib/ursp/db")).getState<import("../lib/ursp/core").BackfillState>("recap_backfill");
    check(bf && !bf.running && !bf.error && bf.rows === 3 && bf.stores === 2, "rows from Nov 1 read, October left out", bf);
    check(sheetRanges.some((r) => r === "'Recap v11'!A1:BH"), "read from the Recap v11 tab, quoted", sheetRanges);
    check(!(await target("recap", "octold.myshopify.com")), "an October row is not taken");
    check((await target("recap", "nov1.myshopify.com"))?.status === "approved", "a November row is taken");
    check((await target("recap", "nov2.myshopify.com"))?.skip_code === "resolution", "a store's latest row decides (Đợi TS check)");

    console.log("backfill, half each day");
    const days = { "2026-11-06": ["d6a", "d6b", "d6c", "d6d"], "2026-11-07": ["d7a", "d7b", "d7c"] };
    sheetValues = [head];
    let n = 50;
    for (const [day, names] of Object.entries(days))
      for (const nm of names) {
        store(`${nm}.myshopify.com`);
        conv(sid(++n), `${nm}@x.test`, now - 3 * 86_400_000);
        sheetValues.push(line(`${day} 09:00`, `${nm}.myshopify.com`, "Chờ khách phản hồi", sid(n)));
      }
    await core.startRecapBackfill("2026-11-06", "admin:tu", true);
    for (let i = 0; i < 50; i++) {
      const st = await (await import("../lib/ursp/db")).getState<import("../lib/ursp/core").BackfillState>("recap_backfill");
      if (st && !st.running) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const half = await (await import("../lib/ursp/db")).getState<import("../lib/ursp/core").BackfillState>("recap_backfill");
    check(half?.sent_half === 4 && half.held_half === 3, "each day halved: 4 → 2 + 2, 3 → 2 + 1", half);
    const split = (await p.query("select store_domain, status, variant from ursp_targets where store_domain like 'd6%' or store_domain like 'd7%'")).rows;
    const perDay = (pre: string, st: string) => split.filter((r) => r.store_domain.startsWith(pre) && r.status === st).length;
    check(perDay("d6", "held") === 2 && perDay("d7", "held") === 1, "the held half is per day", split);
    check(split.filter((r) => r.status === "held").every((r) => r.variant === "B") && split.filter((r) => r.status !== "held").every((r) => r.variant === "A"), "A sent, B held");
    await core.runJob(true);
    const heldIds = split.filter((r) => r.status === "held").map((r) => r.store_domain);
    const heldSent = heldIds.some((d) => convs[sid(50 + [...days["2026-11-06"], ...days["2026-11-07"]].indexOf(d.split(".")[0]) + 1)]?.msgs.some((m) => m.from === "operator"));
    check(!heldSent, "nothing is sent to the held half");
    check((await p.query("select count(*)::int as n from ursp_targets where variant = 'A' and status = 'sent' and (store_domain like 'd6%' or store_domain like 'd7%')")).rows[0].n === 4, "the A half is sent");
    /* a held store active today is not messaged by Active */
    ac2[heldIds[0]].lastActiveAt = iso(Date.now());
    await p.query("delete from ursp_state where key = 'active'");
    await core.runJob(true);
    const act = await target("active", heldIds[0]);
    check(!act || act.status === "skipped", "Active leaves a held store alone", act?.status);
    check((await queries.segmentStats({})).recap.held === 3, "held counted in the stats");
    delete process.env.URSP_SHEET_SA_JSON;
  }

  console.log("A/B test");
  {
    const big = queries.abVerdict(10, 100, 25, 100);
    check(big.diff === 15 && big.p !== null && big.p < 0.05, "10% vs 25% of 100 each: B better, sure", big);
    const small = queries.abVerdict(10, 100, 12, 100);
    check(small.p !== null && small.p > 0.05 && (small.needed ?? 0) > 100, "10% vs 12%: not sure yet, more needed", small);
    check(queries.abVerdict(0, 0, 1, 10).diff === null, "no A sent: no verdict");
    const cfgNow = await settings.getUrspSettings();
    const bMsg = core.composeMessage("recap", { store_name: "Rep Global", store_domain: "x.myshopify.com" }, cfgNow, "B");
    const aMsg = core.composeMessage("recap", { store_name: "Rep Global", store_domain: "x.myshopify.com" }, cfgNow, "A");
    check(bMsg !== aMsg && bMsg.includes("Quick question") && bMsg.includes("**REP GLOBAL**") && bMsg.includes("{deadline}"), "B is its own message, names bold capitals");
    const before = await queries.abStats();
    check(before.B.held === 3 && before.B.sent === 0 && before.A.sent > 4, "held B counted, nothing sent to it; A counts every A sent", { A: before.A.sent, B: before.B });
    /* a run sends nothing to B */
    await core.runJob(true);
    check((await queries.abStats()).B.sent === 0, "the job leaves the held B alone");
    const released = await core.releaseHeldB("admin:tu");
    check(released === 3, "Gửi bản B queues the 3 held", released);
    await core.runJob(true);
    const after = await queries.abStats();
    check(after.B.sent === 3 && after.B.held === 0, "B sent", after.B);
    const bRow = (await p.query("select message from ursp_targets where variant = 'B' and status = 'sent' limit 1")).rows[0];
    check(/Quick question/.test(bRow?.message ?? "") && !/\{deadline\}/.test(bRow?.message ?? ""), "the B message went, its deadline written in");
    check((await queries.listTargets("sent", { variant: "B" })).total === 3, "Bản B filter");
    /* ab_split: new stores join the half with fewer of their segment — B catches up, then even */
    await settings.saveUrspSettings({ ab_split: 1 });
    const count = async () =>
      (await p.query<{ a: number; b: number }>(
        "select count(*) filter (where variant = 'A')::int as a, count(*) filter (where variant = 'B')::int as b from ursp_targets where segment = 'recap' and status <> 'skipped'",
      )).rows[0];
    const c0 = await count();
    const gap = c0.a - c0.b;
    const k = gap + 4;
    for (let i = 0; i < k; i++) store(`ab${i}.myshopify.com`);
    await core.importRecap(Array.from({ length: k }, (_, i) => row({ store_domain: `ab${i}.myshopify.com`, session_id: sid(100 + i) })));
    const vs = (await p.query("select variant from ursp_targets where store_domain like 'ab%.myshopify.com' order by id")).rows.map((r) => r.variant);
    check(gap > 0 && vs.slice(0, gap).every((v) => v === "B"), `B behind by ${gap}: the next ${gap} go to B`, vs);
    const c1 = await count();
    check(Math.abs(c1.a - c1.b) <= 1, "then the two stay even", c1);
    await settings.saveUrspSettings({ ab_split: 0 });
    store("alla.myshopify.com");
    await core.importRecap([row({ store_domain: "alla.myshopify.com", session_id: sid(140) })]);
    const allA = await target("recap", "alla.myshopify.com");
    check(allA?.variant === "A", "ab_split 0: A", { v: allA?.variant, st: allA?.status, sk: allA?.skip_code });
    /* drain the queue the balancing test filled, so the next checks start clean */
    for (let i = 0; i < 8; i++) await core.runJob(true);
  }

  console.log("never twice");
  /* same store queued in both segments (n8n's post racing the job): one message */
  store("twice.myshopify.com");
  await p.query(
    `insert into ursp_targets (segment, store_domain, email, status, message, session_id, source)
     values ('recap', 'twice.myshopify.com', 'twice@x.test', 'approved', 'Hi twice, the offer for you here', $1, '{}'),
            ('active', 'twice.myshopify.com', 'twice@x.test', 'approved', 'Hi twice, the offer for you here', null, '{}')`,
    [sid(20)],
  );
  conv(sid(20), "twice@x.test", now - 3 * 86_400_000);
  await core.runJob(true);
  const both = (await p.query("select segment, status, skip_code from ursp_targets where store_domain = 'twice.myshopify.com' order by segment")).rows;
  check(both.filter((r) => r.status === "sent").length === 1 && both.some((r) => r.skip_code === "already_sent"), "queued twice: sent once, the other left out", both);
  /* another store, same email */
  store("twin.myshopify.com", { email: "twice@x.test", lastActiveAt: iso(Date.now()) });
  await p.query("delete from ursp_state where key = 'active'");
  await core.runJob(true);
  check((await target("active", "twin.myshopify.com"))?.skip_code === "already_sent", "same email on another store: left out");
  const twin = (await target("active", "twin.myshopify.com"))!;
  let refusedTwin = false;
  try {
    await core.targetAction(twin.id, "send_anyway", "tu");
  } catch {
    refusedTwin = true;
  }
  check(refusedTwin, "Vẫn gửi refuses a store / email already sent");

  console.log("pause");
  await settings.setRunning(false, "admin:test");
  const sentBefore = convs[sid(2)].msgs.length;
  check((await core.runJob(true)) === null, "Tạm dừng: the job does nothing");
  check(convs[sid(2)].msgs.length === sentBefore, "nothing is sent while paused");
  await settings.setRunning(true, "admin:test");
  check((await (await import("../lib/ursp/db")).getState("recap_cursor")) === null, "Bắt đầu again starts the sheet from its end");

  check(haikuCalls > 0, "Haiku was asked");
  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  await p.end();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
