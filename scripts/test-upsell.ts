/* ==========================================================================
   Upsell Build Pages — the rules, against a real Postgres.

       UPSELL_TEST_DATABASE_URL=postgres://postgres@localhost:5432/upsell_test \
         npx tsx scripts/test-upsell.ts

   POSTGRES, NOT THE FILE STORE: the module only runs on Postgres, and the
   rules worth testing (row locks, the one-message-per-kind index) live in
   it. THE DATABASE IS WIPED — every upsell_* table is dropped first — so point
   this at a database that exists for the test and nothing else.
   ========================================================================== */

import { createRequire } from "node:module";
import Module from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";

const require_ = createRequire(import.meta.url);
const resolve_ = (Module as unknown as { _resolveFilename: (r: string, ...a: unknown[]) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: unknown })._resolveFilename = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === "server-only") return require_.resolve("./server-only.cjs");
  return resolve_.call(this, request, ...args);
} as never;

const url = process.env.UPSELL_TEST_DATABASE_URL;
if (!url) {
  console.log("UPSELL_TEST_DATABASE_URL is not set — skipping (this test needs a throwaway Postgres).");
  process.exit(0);
}
for (const k of Object.keys(process.env)) if (/^postgres(ql)?:\/\//.test(process.env[k] ?? "")) delete process.env[k];
process.env.DATABASE_URL = url;
process.env.UPSELL_STORAGE_DIR = mkdtempSync(join(tmpdir(), "pfd-upsell-test-"));
process.env.UPSELL_API_KEY = "test-key-0123456789abcdef";
process.env.PFD_PUBLIC_URL = "https://pfd.test";

let failures = 0;
function check(ok: boolean, label: string, detail: unknown = null): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail !== null && !ok ? ` — ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}
async function rejects(p: Promise<unknown>, status: number, label: string): Promise<void> {
  try {
    await p;
    check(false, label, "did not throw");
  } catch (err) {
    const s = (err as { status?: number }).status;
    check(s === status, label, { status: s, message: (err as Error).message });
  }
}

const pf = () => zipSync({ "page.json": strToU8(JSON.stringify({ type: "page", items: [] })) });
const html = (t: string) => strToU8(`<!doctype html><html><body><h1>${t}</h1></body></html>`);
const files = (tag: string) => ({
  page1_html: html(`${tag} home`),
  page1_pagefly: pf(),
  page2_html: html(`${tag} product`),
  page2_pagefly: pf(),
});

async function main() {
  const { db, closeUpsellPool } = await import("../lib/upsell/db");
  const leads = await import("../lib/upsell/leads");
  const designs = await import("../lib/upsell/designs");
  const messages = await import("../lib/upsell/messages");
  const review = await import("../lib/upsell/review");
  const track = await import("../lib/upsell/track");
  const access = await import("../lib/upsell/access");
  const maintenance = await import("../lib/upsell/maintenance");
  const api = await import("../lib/upsell/api");
  const settings = await import("../lib/upsell/settings");
  const notify = await import("../lib/upsell/notify");
  const adminQueries = await import("../lib/upsell/adminQueries");
  const { REPEATED_FAILURE } = await import("../lib/upsell/types");

  {
    const { Pool } = await import("pg");
    const raw = new Pool({ connectionString: url });
    await raw.query(
      "drop table if exists upsell_events, upsell_messages, upsell_pages, upsell_designs, upsell_leads, upsell_installs, upsell_settings cascade",
    );
    await raw.end();
  }
  const p = await db();
  const ctx = (o: Partial<{ visitorId: string; userAgent: string; isAdmin: boolean }> = {}) => ({
    visitorId: o.visitorId ?? "visitor-aaaaaaaa",
    ip: "203.0.113.9",
    userAgent: o.userAgent ?? "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 Safari/605.1.15",
    isAdmin: o.isAdmin ?? false,
  });

  console.log("installs");
  {
    const r = await leads.upsertInstalls([
      { store_domain: "Alpha.myshopify.com", installed_at: new Date().toISOString(), store_name: "Alpha", lead_score: 7, lead: true, skip_reason: "" },
      { store_domain: "beta.myshopify.com", installed_at: new Date().toISOString(), lead_score: 2, lead: false, skip_reason: "Score < 6" },
      { nope: true },
    ]);
    check(r.upserted === 2 && r.invalid === 1, "two upserted, one refused", r);
    await leads.upsertInstalls([{ store_domain: "beta.myshopify.com", lead_score: 3 }]);
    const list = await leads.listInstalls(80);
    const beta = list.find((i) => i.store_domain === "beta.myshopify.com");
    check(list.length === 2 && beta?.lead_score === 3 && beta?.skip_reason === "Score < 6", "upsert updates named columns, keeps the rest", beta);
    check(list.some((i) => i.store_domain === "alpha.myshopify.com"), "domain is lower-cased");
  }

  console.log("leads");
  {
    const r = await leads.upsertLeads([
      { lead_id: "L261012AAAA", store_domain: "alpha.myshopify.com", store_name: "Alpha", group: "test", status: "new", lead_score: 9, price_at_send: 0 },
      { lead_id: "L261012CCCC", store_domain: "ctrl.myshopify.com", store_name: "Ctrl", group: "control", status: "control", lead_score: 7 },
      { lead_id: "L261012DUPE", store_domain: "alpha.myshopify.com" },
    ]);
    check(r.created.length === 2 && r.skipped.length === 1, "two created, the second id for one store skipped", r);
    const created = await p.query("select type from upsell_events where type = 'lead_created'");
    check(created.rowCount === 2, "lead_created events written");
    const a = await leads.getLead("L261012AAAA");
    check(a?.pic === "Logan" && a?.status === "new", "pic defaults from settings", a?.pic);
  }

  console.log("build status");
  {
    await rejects(leads.setBuildStatus("L261012AAAA", "approved", null), 422, "builder cannot set approved");
    await rejects(leads.setBuildStatus("NOPE", "building", null), 404, "unknown lead is 404");
    const b = await leads.setBuildStatus("L261012AAAA", "building", null);
    check(b.status === "building" && Boolean(b.build_started_at), "building records build_started_at");
    await leads.upsertLeads([{ lead_id: "L261012AAAA", store_domain: "alpha.myshopify.com", store_name: "Alpha Co", status: "new", lead_score: 10 }]);
    const a = await leads.getLead("L261012AAAA");
    check(a?.status === "building" && a?.store_name === "Alpha Co", "re-upsert refreshes profile but keeps building", a?.status);
    const q = await leads.buildQueue(["new", "rebuild_requested"], 5);
    check(q.length === 0, "a building lead and a control lead are not in the queue", q.map((l) => l.lead_id));
  }

  console.log("upload");
  let designId = "";
  {
    await rejects(
      designs.uploadDesign({ lead_id: "L261012AAAA", page1_type: "home", page2_type: "product" }, { ...files("x"), page1_pagefly: strToU8("not a zip") }),
      422,
      "an invalid .pagefly is 422",
    );
    await rejects(
      designs.uploadDesign({ lead_id: "L261012AAAA", page1_type: "blog", page2_type: "product" }, files("x")),
      422,
      "an unknown page type is 422",
    );
    await rejects(
      designs.uploadDesign({ lead_id: "L261012CCCC", page1_type: "home", page2_type: "product" }, files("x")),
      409,
      "a control lead cannot receive pages",
    );
    const r = await designs.uploadDesign(
      { lead_id: "L261012AAAA", store_domain: "alpha.myshopify.com", page1_type: "home", page1_title: "Home", page2_type: "product", build_note: "Dùng màu nâu" },
      files("v1"),
    );
    designId = r.id;
    check(/^[2-9A-HJ-NP-Z]{8}$/.test(r.id) && r.version === 1, "8-char id without 0/O/1/I, version 1", r);
    check(r.url === `https://pfd.test/new-page?id=${r.id}` && r.admin_url.endsWith("/admin/upsell/leads/L261012AAAA"), "links in the answer", r);
    const a = await leads.getLead("L261012AAAA");
    check(a?.status === "pending_review" && a?.page1_type === "home" && a?.build_note === "Dùng màu nâu", "lead is pending_review with page types", a?.status);
    await rejects(designs.uploadDesign({ lead_id: "L261012AAAA", page1_type: "home", page2_type: "product" }, files("again")), 409, "no upload while in review");
  }

  console.log("review transitions");
  {
    await rejects(review.approveLead("L261012CCCC", {}, "admin:t"), 409, "cannot approve a control lead");
    await rejects(review.requestRebuild("L261012AAAA", { note: "  " }, "admin:t"), 400, "rebuild needs a note");
    await rejects(review.rejectLead("L261012AAAA", "", "admin:t"), 400, "reject needs a reason");
    await review.requestRebuild("L261012AAAA", { note: "Đổi page 2 thành collection", page_types: ["home", "collection"] }, "admin:t");
    let a = await leads.getLead("L261012AAAA");
    check(a?.status === "rebuild_requested" && a?.rebuild_count === 1 && a?.rebuild_page_types?.[1] === "collection", "rebuild requested", a);
    const q = await leads.buildQueue(["rebuild_requested"], 2);
    check(q[0]?.lead_id === "L261012AAAA" && q[0]?.design_id === designId, "rebuild is queued with its design", q[0]?.design_id);
    const r2 = await designs.uploadDesign({ lead_id: "L261012AAAA", page1_type: "home", page2_type: "collection" }, files("v2"));
    check(r2.id === designId && r2.version === 2, "rebuild keeps the id, version 2", r2);
    const pages = await p.query("select version from upsell_pages where design_id = $1 order by version, slot", [designId]);
    check(pages.rows.map((x) => x.version).join() === "1,1,2,2", "version 1 pages kept as history");
    a = await leads.getLead("L261012AAAA");
    check(a?.rebuild_note === null && a?.status === "pending_review", "upload clears rebuild_note");
    const v1 = await designs.getDesign(designId, 1);
    check(v1?.pages[1]?.type === "product" && (await designs.getDesign(designId))?.pages[1]?.type === "collection", "old version still readable");
  }

  console.log("page access before send");
  {
    const view = await designs.getDesign(designId);
    check(view !== null && access.customerState(view) === "not_sent", "customer cannot see a design in review");
    const t = await track.trackCustomerEvent({ id: designId, type: "view" }, ctx());
    check(!t.recorded && t.reason === "not visible", "events before the send are not counted", t);
  }

  console.log("approve → initial message");
  let initialId = "";
  {
    await rejects(review.approveLead("L261012ZZZZ", {}, "admin:t"), 404, "unknown lead is 404");
    const r = await review.approveLead("L261012AAAA", { send_mode: "window" }, "admin:tester");
    initialId = r.message_id;
    const m = (await messages.messagesForLead("L261012AAAA"))[0];
    check(m?.kind === "initial" && m.status === "approved" && m.approved_by === "admin:tester", "initial message created, approved", m);
    check(m.content.includes("Alpha Co") && m.content.includes(`https://pfd.test/new-page?id=${designId}`) && m.content.includes("Collection page"), "template filled", m.content);
    const a = await leads.getLead("L261012AAAA");
    check(a?.status === "approved" && a?.reviewed_by === "admin:tester", "lead approved, reviewer recorded");
    await rejects(review.approveLead("L261012AAAA", {}, "admin:t"), 409, "cannot approve twice");
    const out = await messages.approvedForSending();
    check(out.length === 1 && out[0].lead.email === null && out[0].lead.design_url?.endsWith(designId) === true, "approved message is served to the script", out);

    /* Take it back and approve again with edited text: the same row is reused. */
    await messages.unapproveMessage(initialId, "admin:t");
    check((await leads.getLead("L261012AAAA"))?.status === "pending_review", "unapproving the initial message returns the lead to review");
    check((await messages.approvedForSending()).length === 0, "nothing to send after unapprove");
    const r2 = await review.approveLead("L261012AAAA", { content: "Hi **Alpha**, edited", send_mode: "now" }, "admin:t");
    check(r2.message_id === initialId, "re-approval reuses the initial message");
    const again = await messages.approvedForSending();
    check(again[0]?.content === "Hi **Alpha**, edited" && again[0]?.send_mode === "now", "edited content and send mode kept", again[0]);
  }

  console.log("send result");
  {
    await rejects(messages.reportResult(initialId, { status: "maybe" as "sent" }), 422, "bad result status is 422");
    const r = await messages.reportResult(initialId, {
      status: "sent",
      sent_at: "2026-10-12T03:00:00Z",
      crisp_session: "session_abc",
      ticket_link: "https://app.crisp.chat/x",
      plan_at_send: "Free",
      price_at_send: 0,
      pages_at_send: 1,
    });
    check(r.changed, "first report changes things");
    const a = await leads.getLead("L261012AAAA");
    check(a?.status === "sent" && a?.sent_at === "2026-10-12T03:00:00Z" && a?.crisp_session === "session_abc" && a?.pages_at_send === 1, "lead is sent with send fields", a);
    const d = (await designs.getDesign(designId))!.design;
    check(d.expires_at === "2026-11-11T03:00:00Z", "link expires 30 days after the send", d.expires_at);
    const r2 = await messages.reportResult(initialId, { status: "failed", error: "late duplicate" });
    check(!r2.changed && r2.message.status === "sent", "second report changes nothing");
    const sentEvents = await p.query("select 1 from upsell_events where type = 'message_sent'");
    check(sentEvents.rowCount === 1, "one message_sent event");
    check((await messages.approvedForSending()).length === 0, "a sent message is no longer served");
  }

  console.log("customer events");
  {
    const view = await designs.getDesign(designId);
    check(access.customerState(view!) === "ok", "customer can see it after the send");
    const bot = await track.trackCustomerEvent({ id: designId, type: "view" }, ctx({ userAgent: "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" }));
    const crisp = await track.trackCustomerEvent({ id: designId, type: "view" }, ctx({ userAgent: "Mozilla/5.0 (compatible; Crisp/1.0; +https://crisp.chat)" }));
    const headless = await track.trackCustomerEvent({ id: designId, type: "view" }, ctx({ userAgent: "Mozilla/5.0 HeadlessChrome/120" }));
    const admin = await track.trackCustomerEvent({ id: designId, type: "view" }, ctx({ isAdmin: true }));
    check(!bot.recorded && !crisp.recorded && !headless.recorded, "bots and unfurlers ignored");
    check(!admin.recorded && admin.reason === "admin", "admin session ignored");
    check((await leads.getLead("L261012AAAA"))?.status === "sent", "ignored views do not move the lead");
    await track.trackCustomerEvent({ id: designId, type: "view" }, ctx());
    await track.trackCustomerEvent({ id: designId, type: "view" }, ctx());
    await track.trackCustomerEvent({ id: designId, type: "view" }, ctx({ visitorId: "visitor-bbbbbbbb" }));
    check((await leads.getLead("L261012AAAA"))?.status === "viewed", "first view → viewed");
    await track.trackCustomerEvent({ id: designId, type: "download", page_slot: 1 }, ctx());
    check((await leads.getLead("L261012AAAA"))?.status === "downloaded", "first download → downloaded");
    await track.trackCustomerEvent({ id: designId, type: "feedback", rating: 5, comment: "<b>love</b> it".padEnd(1500, "!") }, ctx());
    await track.trackCustomerEvent({ id: designId, type: "cta_click" }, ctx());
    const ex = (await leads.exportLeads({ trackingDays: 30 })).find((l) => l.lead_id === "L261012AAAA")!;
    check(ex.views === 3 && ex.unique_views === 2 && ex.downloads === 1 && ex.cta_clicks === 1 && ex.rating === 5, "export counts customer events only", ex);
    check(ex.last_comment?.length === 1000 && ex.last_comment.startsWith("<b>love</b>"), "comment capped at 1000, stored raw (escaped on display)");
    check(ex.message_kinds.join() === "initial" && ex.design_url === `https://pfd.test/new-page?id=${designId}`, "export has message kinds and design link");
    let limited = 0;
    for (let i = 0; i < 35; i++) {
      const r = await track.trackCustomerEvent({ id: designId, type: "device_toggle" }, ctx({ visitorId: "visitor-flood000" }));
      if (r.reason === "rate limited") limited++;
    }
    check(limited === 5, "30 events a minute per visitor", limited);
  }

  console.log("drafts");
  {
    const r = await messages.createDrafts([
      { lead_id: "L261012AAAA", kind: "followup1", content: "Hi again" },
      { lead_id: "L261012AAAA", kind: "followup1", content: "Hi again (dupe)" },
      { lead_id: "L261012AAAA", kind: "initial", content: "sneaky" },
      { lead_id: "L261012AAAA", kind: "custom", content: "one" },
      { lead_id: "L261012AAAA", kind: "custom", content: "two" },
      { lead_id: "L000000NONE", kind: "review", content: "x" },
    ]);
    check(r.created.length === 3 && r.skipped.length === 3, "followup once, customs twice; dupe, initial and unknown skipped", r);
    const again = await messages.createDrafts([{ lead_id: "L261012AAAA", kind: "followup1", content: "third run" }]);
    check(again.created.length === 0, "a later run does not draft the same kind again");
    check((await messages.approvedForSending()).length === 0, "drafts are never served before approval");
    const fu = r.created[0];
    await messages.approveMessage(fu, { content: "Hi again, edited" }, "admin:t");
    const out = await messages.approvedForSending();
    check(out.length === 1 && out[0].kind === "followup1" && out[0].content === "Hi again, edited", "approved follow-up is served", out);
    await messages.reportResult(fu, { status: "sent", sent_at: "2026-10-14T03:00:00Z" });
    check((await leads.getLead("L261012AAAA"))?.followup1_at === "2026-10-14T03:00:00Z", "followup1_at recorded");

    /* A follow-up for a lead with no Crisp conversation is held back. */
    await leads.upsertLeads([{ lead_id: "L261012EEEE", store_domain: "echo.myshopify.com", group: "test" }]);
    const d = await messages.createDrafts([{ lead_id: "L261012EEEE", kind: "review", content: "please review" }]);
    await messages.approveMessage(d.created[0], {}, "admin:t");
    check(!(await messages.approvedForSending()).some((m) => m.lead_id === "L261012EEEE"), "review ask without a conversation is not served");
  }

  console.log("send failures");
  {
    /* Slack goes to a local server, so what would be posted can be read. */
    const { createServer } = await import("node:http");
    const posts: string[] = [];
    const hook = createServer((rq, rs) => {
      let b = "";
      rq.on("data", (d) => (b += d));
      rq.on("end", () => {
        posts.push(b);
        rs.end("ok");
      });
    });
    await new Promise<void>((r) => hook.listen(0, "127.0.0.1", () => r()));
    const port = (hook.address() as { port: number }).port;
    await settings.saveSettings({ slack_webhook_url: `http://127.0.0.1:${port}/hook` });
    await settings.setInternal("slack_last_at", 0);
    await settings.setInternal("slack_pending", []);
    const waitPosts = async (n: number) => {
      for (let i = 0; i < 50 && posts.length < n; i++) await new Promise((r) => setTimeout(r, 50));
    };

    const d = await messages.createDrafts([{ lead_id: "L261012AAAA", kind: "custom", content: "try me" }]);
    const id = d.created[0];
    await waitPosts(1); // the draft's own "có việc cần duyệt"
    posts.length = 0;
    await settings.setInternal("slack_last_at", 0);
    await messages.approveMessage(id, { send_mode: "window" }, "admin:t");

    const r1 = await messages.reportResult(id, { status: "failed", error: "Crisp create 401" });
    check(r1.changed && r1.message.status === "failed" && r1.message.attempts === 1 && Boolean(r1.message.failed_at), "failure recorded: attempts 1, failed_at set", r1.message);
    const dup = await messages.reportResult(id, { status: "failed", error: "Crisp create 401" });
    check(!dup.changed && dup.message.attempts === 1, "the same failure reported twice counts once", dup.message);

    await waitPosts(1);
    check(posts.length === 1 && posts[0].includes("tab=failed") && posts[0].includes("1 tin gửi lỗi"), "a new failure goes to Slack, linking Lỗi gửi", posts);

    const list = await adminQueries.listMessages("failed", {});
    const row = list.rows.find((m) => m.id === id);
    check(list.total === 1 && row?.error === "Crisp create 401" && row.attempts === 1 && row.store_domain === "alpha.myshopify.com", "Lỗi gửi lists it with store, reason and attempts", list);
    const leadA = await leads.getLead("L261012AAAA");
    check(Boolean(leadA?.ticket_link) && row?.ticket_link === leadA?.ticket_link, "Lỗi gửi carries the lead's Crisp ticket", row?.ticket_link);
    const tracking = await adminQueries.listLeadTab("tracking", {});
    check(tracking.rows.some((l) => l.lead_id === "L261012AAAA" && l.ticket_link === leadA?.ticket_link), "Đang theo dõi rows carry the ticket", tracking.rows.map((l) => l.ticket_link));
    const { DEFAULT_INITIAL_TEMPLATE } = await import("../lib/upsell/common");
    /* Crisp renders neither **[text](url)** nor [**text**](url): links stay plain. */
    const links = [...DEFAULT_INITIAL_TEMPLATE.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)];
    check(
      links.length === 1 &&
        DEFAULT_INITIAL_TEMPLATE.includes("👉 [See your 2 pages]({link})") &&
        links.every((m) => !m[1].includes("*") && !DEFAULT_INITIAL_TEMPLATE.slice(0, m.index).endsWith("*") && !DEFAULT_INITIAL_TEMPLATE.slice(m.index! + m[0].length).startsWith("*")),
      "first message: the link is plain, no ** in or around it",
      links.map((m) => m[0]),
    );
    check((await adminQueries.tabCounts()).failed === 1, "the tab counts it");
    check((await review.pendingCounts()).failed === 1, "the sidebar counts it");

    /* Retry: approve again. The count stays; the error clears until the next report. */
    await messages.approveMessage(id, { send_mode: "now" }, "admin:t");
    const back = (await messages.messagesForLead("L261012AAAA")).find((m) => m.id === id)!;
    check(back.status === "approved" && back.error === null && back.attempts === 1 && back.send_mode === "now", "retry puts it back to send, count kept", back);
    check((await review.pendingCounts()).failed === 0, "a retried message leaves Lỗi gửi");

    const r2 = await messages.reportResult(id, { status: "failed", error: "Crisp message 500" });
    await messages.approveMessage(id, { send_mode: "window" }, "admin:t");
    const r3 = await messages.reportResult(id, { status: "failed", error: "Crisp create 401" });
    check(r2.message.attempts === 2 && r3.message.attempts === 3 && r3.message.attempts >= REPEATED_FAILURE, "each new failure counts: third is 'Lỗi nhiều lần'", [r2.message.attempts, r3.message.attempts]);

    await new Promise((r) => setTimeout(r, 300));
    check(posts.length === 1, "within 15 minutes Slack is not pinged again", posts.length);
    check(((await settings.getInternal("slack_pending")) as string[]).includes("failed"), "the failure waits for the next window");
    await settings.setInternal("slack_last_at", 0);
    check(await notify.flushSlack(), "the next window sends it");
    check(posts.length === 2 && posts[1].includes("tab=failed"), "…with the Lỗi gửi link", posts[1]);

    const stats = await adminQueries.upsellStats({});
    const by = (reason: string) => stats.failuresByReason.find((x) => x.reason === reason);
    check(by("Crisp create 401")?.failures === 2 && by("Crisp create 401")?.messages === 1 && by("Crisp create 401")?.open === 1, "stats: failures by reason, still open", stats.failuresByReason);
    check(by("Crisp message 500")?.failures === 1 && by("Crisp message 500")?.open === 1, "stats: each reason its own row", stats.failuresByReason);

    /* Bulk retry is approveMessage per id, as the bulk route runs it. */
    const d2 = await messages.createDrafts([{ lead_id: "L261012AAAA", kind: "custom", content: "second" }]);
    await messages.approveMessage(d2.created[0], {}, "admin:t");
    await messages.reportResult(d2.created[0], { status: "failed", error: "No email" });
    check((await adminQueries.listMessages("failed", {})).total === 2, "two on Lỗi gửi");
    for (const m of [id, d2.created[0]]) await messages.approveMessage(m, { send_mode: "window" }, "admin:t");
    check((await adminQueries.tabCounts()).failed === 0, "retrying the selected ones empties Lỗi gửi");

    await messages.reportResult(d2.created[0], { status: "failed", error: "No email" });
    await messages.rejectMessage(d2.created[0], "admin:t");
    const dropped = (await messages.messagesForLead("L261012AAAA")).find((m) => m.id === d2.created[0])!;
    check(dropped.status === "rejected" && (await adminQueries.tabCounts()).failed === 0, "Bỏ drops a failed message", dropped.status);
    await messages.reportResult(id, { status: "sent", sent_at: "2026-10-14T05:00:00Z" });

    await settings.saveSettings({ slack_webhook_url: "" });
    await new Promise<void>((r) => hook.close(() => r()));
  }

  console.log("sync");
  {
    /* E is new — sync must never move it. */
    const s1 = await leads.syncLeads([{ lead_id: "L261012EEEE", status: "upgraded", current_plan: "Pay as you go" }, { lead_id: "L999" }]);
    check((await leads.getLead("L261012EEEE"))?.status === "new" && s1.status_ignored.length === 1 && s1.unknown[0] === "L999", "sync does not move a pre-send lead", s1);
    check((await leads.getLead("L261012EEEE"))?.current_plan === "Pay as you go", "but its other fields are written");
    const s2 = await leads.syncLeads([{ lead_id: "L261012AAAA", status: "viewed", replied: true, last_reply_text: "Thanks!", last_reply_at: "2026-10-13T01:00:00Z" }]);
    check((await leads.getLead("L261012AAAA"))?.status === "downloaded" && s2.status_ignored.length === 1, "sync does not move backward");
    await leads.syncLeads([{ lead_id: "L261012AAAA", status: "upgraded", upgraded: true, upgraded_to: "Silver", mrr_added: 24, current_price: 24 }]);
    const a = await leads.getLead("L261012AAAA");
    check(a?.status === "upgraded" && a?.upgraded === true && a?.mrr_added === 24 && a?.message_read === null, "forward to upgraded; absent fields untouched", a);
    const ev = await p.query("select type, detail from upsell_events where lead_id = 'L261012AAAA' and type in ('replied','upgraded') order by id");
    check(ev.rows.map((r) => r.type).join() === "replied,upgraded" && ev.rows[1].detail.from === "downloaded", "replied and upgraded events, folded with the status move", ev.rows);
    await leads.syncLeads([{ lead_id: "L261012AAAA", upgraded: true }]);
    const ev2 = await p.query("select 1 from upsell_events where lead_id = 'L261012AAAA' and type = 'upgraded'");
    check(ev2.rowCount === 1, "no second upgraded event for the same news");
    await leads.syncLeads([{ lead_id: "L261012CCCC", status: "uninstalled", app_status: "uninstalled", uninstalled_at: "2026-10-12T05:00:00Z" }]);
    check((await leads.getLead("L261012CCCC"))?.status === "uninstalled", "a control lead can become uninstalled");
  }

  console.log("requeue, install → lead, timeouts");
  {
    await leads.upsertLeads([{ lead_id: "L261012FFFF", store_domain: "fox.myshopify.com", group: "test" }]);
    await leads.setBuildStatus("L261012FFFF", "skipped", "Store is a test store");
    check((await leads.getLead("L261012FFFF"))?.error === "Store is a test store", "skip reason kept in error");
    await review.requeueLead("L261012FFFF", "admin:t");
    check((await leads.getLead("L261012FFFF"))?.status === "new", "skipped lead requeued as new");
    await rejects(review.requeueLead("L261012FFFF", "admin:t"), 409, "a new lead cannot be requeued");

    const lid = await review.installToLead("beta.myshopify.com", "admin:t");
    const b = await leads.getLead(lid);
    check(b?.status === "new" && b?.priority === "high" && b?.group === "test", "skipped install added by hand as a high-priority test lead", b);
    await rejects(review.installToLead("beta.myshopify.com", "admin:t"), 409, "cannot add the same store twice");

    await leads.setBuildStatus("L261012FFFF", "building", null);
    const stale = () => p.query("update upsell_leads set build_started_at = now() - interval '4 hours' where lead_id = 'L261012FFFF'");
    await stale();
    let t = await maintenance.tick();
    check(t.requeued.includes("L261012FFFF") && (await leads.getLead("L261012FFFF"))?.status === "new", "stale build returns to new");
    await leads.setBuildStatus("L261012FFFF", "building", null);
    await stale();
    t = await maintenance.tick();
    const f = await leads.getLead("L261012FFFF");
    check(t.errored.includes("L261012FFFF") && f?.status === "error" && f.build_timeouts === 2, "second timeout is an error", f);
    const fresh = await maintenance.tick();
    check(fresh.requeued.length === 0 && fresh.errored.length === 0, "a tick with nothing stale changes nothing");
  }

  console.log("purge");
  {
    await p.query("update upsell_designs set expires_at = now() - interval '61 days' where id = $1", [designId]);
    const t = await maintenance.tick();
    const view = await designs.getDesign(designId);
    check(t.purged.includes(designId) && view !== null && access.customerState(view) === "purged", "files purged after 60 days, rows kept");
    const evs = await p.query("select count(*)::int as n from upsell_events where design_id = $1", [designId]);
    check(evs.rows[0].n > 0, "events kept");
  }

  console.log("api key and ids");
  {
    const req = (key?: string) => new Request("https://x/api", { headers: key ? { "x-api-key": key } : {} });
    check(api.apiKeyOk(req("test-key-0123456789abcdef")), "right key accepted");
    check(!api.apiKeyOk(req("wrong")) && !api.apiKeyOk(req()), "wrong or missing key refused");
    check(api.requireKey(req("wrong"))?.status === 401, "wrong key is 401");
    const py = execFileSync("python3", [
      "-c",
      "import hashlib;d='zircon.myshopify.com';h=int(hashlib.sha1(d.encode()).hexdigest(),16);n=h%36**4;s=''\nfor _ in range(4):\n s='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[n%36]+s;n//=36\nprint(s)",
    ]).toString().trim();
    check(leads.leadIdFor("zircon.myshopify.com").leadId.slice(7) === py, "lead id suffix matches bpu_ops.py", py);
  }

  console.log("marked as sent on WhatsApp");
  {
    await review.setWhatsappSent("L261012AAAA", true, "admin:mai");
    const on = (await leads.getLead("L261012AAAA"))!;
    check(Boolean(on.whatsapp_sent_at) && on.whatsapp_sent_by === "admin:mai", "marking records when and who", on);
    await review.setWhatsappSent("L261012AAAA", true, "admin:other");
    check((await leads.getLead("L261012AAAA"))!.whatsapp_sent_by === "admin:mai", "marking again changes nothing");
    await leads.syncLeads([{ lead_id: "L261012AAAA", whatsapp_sent_at: null, whatsapp_sent_by: "claude" }]);
    check(Boolean((await leads.getLead("L261012AAAA"))!.whatsapp_sent_at), "the script's sync cannot clear it");
    const row = (await adminQueries.listLeadTab("upgraded", {})).rows.find((l) => l.lead_id === "L261012AAAA");
    check(Boolean(row?.whatsapp_sent_at), "the lead tables carry it");
    await review.setWhatsappSent("L261012AAAA", false, "admin:mai");
    const off = (await leads.getLead("L261012AAAA"))!;
    check(off.whatsapp_sent_at === null && off.whatsapp_sent_by === null, "unmarking clears it");
    const ev = await adminQueries.leadDetail("L261012AAAA");
    const types = ev!.events.map((e) => e.type);
    check(types.filter((t) => t === "whatsapp_sent").length === 1 && types.includes("whatsapp_unmarked"), "both on the timeline, once each", types);
  }

  console.log("phone → WhatsApp");
  {
    const { whatsappUrl } = await import("../lib/upsell/format");
    check(whatsappUrl("+1 (555) 010-2030") === "https://wa.me/15550102030", "+ number becomes a wa.me link, digits only");
    check(whatsappUrl("0084 912 345 678") === "https://wa.me/84912345678", "00 prefix is read as international");
    check(whatsappUrl("0912345678") === null, "a local number gets no link (country unknown)");
    check(whatsappUrl("") === null && whatsappUrl(null) === null && whatsappUrl("+12") === null, "empty or too short: none");
  }

  console.log("settings: saved in admin, read back by the API");
  {
    const settingsRoute = await import("../app/api/upsell/settings/route");
    const queueRoute = await import("../app/api/upsell/queue/route");
    const keyed = (path: string) => new Request(`https://x${path}`, { headers: { "x-api-key": "test-key-0123456789abcdef" } });
    const readApi = async () => {
      const res = await settingsRoute.GET(keyed("/api/upsell/settings"));
      return { res, body: (await res.json()) as { settings: Record<string, unknown> } };
    };

    /* Each key, one at a time, as the form sends it: the value as typed (a string). */
    const next: Record<string, string> = {
      score_threshold: "7",
      control_percent: "25",
      min_products: "3",
      max_builds_per_run: "1",
      followup1_hours: "36",
      followup2_hours: "120",
      send_hour_start: "8",
      send_hour_end: "20",
      tracking_days: "45",
      install_lookback_hours: "5",
      pic: "Mai",
      review_url: "https://apps.shopify.com/pagefly#reviews",
      initial_message_template: "Hi **{store_name}**, 👉 [See your 2 pages]({link})",
      slack_webhook_url: "https://hooks.slack.test/T000/B000/xyz",
    };
    check(Object.keys(next).sort().join() === [...settings.SETTING_KEYS].sort().join(), "the test covers every setting", settings.SETTING_KEYS);
    for (const k of settings.SETTING_KEYS) {
      const saved = await settings.saveSettings({ [k]: next[k] });
      const { res, body } = await readApi();
      const want = settings.NUMERIC_KEYS.includes(k) ? Number(next[k]) : k === "slack_webhook_url" ? "(set)" : next[k];
      check(String(saved[k]) === next[k] && body.settings[k] === want, `${k}: saved ${next[k]}, API returns ${JSON.stringify(want)}`, { saved: saved[k], api: body.settings[k] });
      check(res.headers.get("cache-control") === "no-store", `${k}: the answer is not cacheable`);
    }

    /* A save names only what changed: everything else stays as stored. */
    await settings.saveSettings({ pic: "Logan" });
    const after = (await readApi()).body.settings;
    check(after.max_builds_per_run === 1 && after.install_lookback_hours === 5 && after.pic === "Logan", "saving one key leaves the others alone", after);

    /* Bad input is refused whole, not skipped while answering "saved". */
    await rejects(settings.saveSettings({ max_builds_per_run: "", pic: "Nope" }), 422, "an empty number is 422");
    await rejects(settings.saveSettings({ max_builds_per_run: "abc" }), 422, "a non-number is 422");
    await rejects(settings.saveSettings({ max_build_per_run: 3 }), 422, "a misspelt key is 422");
    const still = (await readApi()).body.settings;
    check(still.max_builds_per_run === 1 && still.pic === "Logan", "a refused save writes nothing", still);

    /* The Builder asks the queue without a limit; the setting decides. */
    for (const [id, dom] of [["L261099QA01", "qa1.myshopify.com"], ["L261099QA02", "qa2.myshopify.com"]])
      await leads.upsertLeads([{ lead_id: id, store_domain: dom, group: "test", status: "new", lead_score: 9 }]);
    const q = (await (await queueRoute.GET(keyed("/api/upsell/queue"))).json()) as { leads: unknown[] };
    check(q.leads.length === 1, "queue without limit gives max_builds_per_run (1) leads", q.leads.length);
    await settings.saveSettings({ max_builds_per_run: 2, slack_webhook_url: "" });
    const q2 = (await (await queueRoute.GET(keyed("/api/upsell/queue"))).json()) as { leads: unknown[] };
    check(q2.leads.length === 2, "…and 2 once it is 2 again", q2.leads.length);
  }

  await closeUpsellPool();
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
