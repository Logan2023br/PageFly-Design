import "server-only";

import {
  ConfigMissing,
  ac2ProxyGet,
  ac2Store,
  ac2UpgradeTime,
  conversationMessages,
  crispSender,
  customerMeta,
  resolveConversation,
  reviewCheck,
  sendInConversation,
  sendInNewConversation,
  sendNote,
  ticketLink,
} from "@/lib/storeSetUpsell/clients";
import { connection } from "@/lib/storeSetUpsell/settings";
import { UpsellError } from "@/lib/upsell/types";
import { readReply } from "./ai";
import { db, getState, hasRsoDatabase, logEvent, setState } from "./db";
import { getRsoSettings, runState, type RsoSettings } from "./settings";
import { SKIP_REASONS, productNames, type RsoPage, type RsoTarget, type SkipCode } from "./types";

/* ==========================================================================
   Radar Sold Out: the Radar's "Tell them a product is out of stock" (AC2 →
   Radar → Help) → a heads-up on Crisp → restocked? → a review request.

     scan    once an hour: the Radar's out-of-stock rows nobody has taken,
             largest traffic first → a heads-up (Chờ duyệt in manual mode),
             Who on the Radar row set to ac2_assignee.
     send    every tick: what is approved goes out in the store's latest
             Crisp conversation (or a new one, which reaches them by email);
             Done = Emailed on the Radar row.
     track   every 15 minutes: read / replies; Haiku reads each new reply —
             an annoyed customer is never contacted again.
     check   once an hour: check_after_days after the heads-up, the Radar row
             gone (or re-scanned without the product) = restocked → a review
             request, unless they already reviewed or were unhappy. Then the
             review is watched for review_wait_days.

   The Radar re-checks a store's products only about once a week, so a store
   it has not re-scanned since the heads-up waits instead of being called
   "still out of stock". Nothing runs while the screen says Tạm dừng.
   ========================================================================== */

const KIND = "out_of_stock_product";
const REVIEW_URL = "https://apps.shopify.com/pagefly?#modal-show=ReviewListingModal";
const TICK_MS = 5 * 60_000;
const SCAN_EVERY_MS = 60 * 60_000;
const TRACK_EVERY_MS = 15 * 60_000;
const CHECK_EVERY_MS = 60 * 60_000;
/* each sent store's plan read again on AC2 this often (a batch every tick) */
const UPGRADE_EVERY_MS = 3 * 60 * 60_000;
const UPGRADE_BATCH = 30;
/* the Radar had this long to re-scan after check_after_days; after that, a person looks */
const MANUAL_AFTER_DAYS = 10;
const DAY = 86_400_000;

/* ---------------------------------------------------------------- AC2 */

type RadarItem = {
  kind: string;
  shopDomain: string;
  paid?: boolean;
  mrr?: number;
  outcome?: string | null;
  assignee?: string | null;
  goneAt?: string | null;
  /* the Radar's signs on the store, when the feed carries them (R2 = no orders in 60 days) */
  signs?: { code?: string }[];
  facts?: {
    /* the store's trading, when the feed carries it */
    stage?: string;
    orders30d?: number;
    orders60d?: number;
    noOrders?: boolean;
    pages?: { title: string; path: string; sessions?: number; products?: string[]; productCount?: number }[];
    sessions30d?: number;
    reviewed?: boolean;
    radarGroup?: string;
    scannedAt?: string;
  };
};

const STORES = "/api/app-data/stores";

/* AC2 the way the other upsells read it: through BPU Ops' n8n proxy
   (N8N_AC2_URL + N8N_AC2_KEY — the AC2 token stays in n8n). The proxy
   answers GETs only: a store path goes as the proxy takes it ("/{domain}"),
   any other AC2 path (the Radar) as the full path. Writes on the Radar
   (Who / Done / note) do not go through it, so they are skipped. */
async function ac2Call<T>(method: "GET" | "PUT", path: string): Promise<T> {
  if (method !== "GET") throw new Error("n8n chỉ đọc AC2 — không ghi lên Radar");
  const [p, qs] = path.split("?");
  const r = await ac2ProxyGet<T>(p.startsWith(STORES) ? p.slice(STORES.length) : p, Object.fromEntries(new URLSearchParams(qs ?? "")));
  if (!r) throw new ConfigMissing("AC2 qua n8n (N8N_AC2_URL + N8N_AC2_KEY)");
  /* The proxy reaches AC2's stores paths (it puts `path` after
     /api/app-data/stores): the Radar comes back empty. Say so. */
  if (p.startsWith("/api/radar") && (r.status !== 200 || r.body === null || !Array.isArray((r.body as { items?: unknown }).items)))
    throw new Error("Chưa đọc được Radar qua n8n: workflow n8n (N8N_AC2_URL) trả về trống cho đường /api/radar — nó mới mở các đường store của AC2.");
  if (r.status !== 200 || r.body === null) throw new Error(`AC2 qua n8n ${p} ${r.status}: ${r.text.slice(0, 160) || "(trống)"}`);
  return r.body;
}

export async function radarRows(): Promise<RadarItem[]> {
  const r = await ac2Call<{ items?: RadarItem[] }>("GET", "/api/radar/opportunities");
  return (r.items ?? []).filter((i) => i.kind === KIND);
}

/** Who / Done / note on the Radar row: n8n only reads AC2, so this is not written —
    kept as the one place to turn it on if the proxy ever takes writes. */
async function radarRecord(domain: string, fields: { outcome?: string; note?: string }, cfg: RsoSettings): Promise<void> {
  void domain;
  void fields;
  void cfg;
}

export async function appReview(domain: string, email: string | null): Promise<number | null> {
  try {
    const s = await ac2Call<{ appReview?: { rating?: number } }>("GET", `/api/app-data/stores/${encodeURIComponent(domain)}`);
    const n = Number(s?.appReview?.rating ?? 0);
    if (n > 0) return n;
  } catch {
    /* Crisp below */
  }
  if (!email) return null;
  const r = await reviewCheck(email).catch(() => null);
  return r?.app_review ?? null;
}

/* ---------------------------------------------------------------- messages */

const clean = (s: string) => String(s || "").replace(/\s*-+\s*$/, "").trim();
const q = (s: string) => `"${s}"`;

function approx(n: number): string | null {
  if (!n || n < 10) return null;
  const step = 10 ** Math.max(String(Math.round(n)).length - 2, 1);
  return (Math.round(n / step) * step).toLocaleString("en-US");
}

function seasonHook(now = new Date()): string {
  const d = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (m === 11 && day <= 27) return ", especially with **Black Friday** coming up";
  if ((m === 11 && day > 27) || (m === 12 && day <= 2)) return ", especially during the **Black Friday** sales";
  if (m === 12 && day <= 23) return ", especially during the **holiday season**";
  return "";
}

type Draft = Pick<RsoTarget, "store_name" | "store_domain" | "pages" | "visits">;

const storeName = (t: Draft) => t.store_name?.trim() || t.store_domain.replace(".myshopify.com", "");
const pageLink = (t: Draft, p: RsoPage) => `https://${t.store_domain}${p.path}`;
const sign = (cfg: RsoSettings) => `**${cfg.sender_name}** – PageFly Support Team`;

/* The built-in messages, written the way the other upsells write on Crisp:
   "Hi **store** 👋", short paragraphs, what matters in bold, the page's own
   link (a product name alone is hard to picture), signed by the sender.
   Product names (what shoppers see), not PageFly's page titles. */
function defaultNotify(t: Draft, cfg: RsoSettings): string {
  const pages = t.pages;
  const many = pages.length > 1 || (pages[0]?.count ?? 1) > 1;
  let body: string;
  if (pages.length === 1) {
    const p = pages[0];
    const v = approx(p.visits);
    const seen = v ? ` gets around **${v} visits a month**, but it` : "";
    body =
      p.count <= 1
        ? `Your PageFly page for **${q(p.products[0] || p.title)}**${seen} is showing the product as **OUT OF STOCK**.\n\n**YOU'RE LOSING REVENUE — SHOPPERS WHO LAND THERE CAN'T PLACE AN ORDER.**${v ? ` That's **${v} visits a month** that can't turn into orders.` : ""}`
        : `Your PageFly page${seen} has **${p.count} products OUT OF STOCK**, including **${p.products.slice(0, 2).map(q).join("** and **")}**.\n\n**YOU'RE LOSING REVENUE — SHOPPERS WHO LAND THERE CAN'T PLACE AN ORDER.**${v ? ` That's **${v} visits a month** that can't turn into orders.` : ""}`;
    body += `\n\n🔗 The page: ${pageLink(t, p)}`;
  } else {
    const list = pages
      .slice(0, 5)
      .map((p) => {
        const v = approx(p.visits);
        return `• **${q(p.products[0] || p.title)}**${v ? ` (~${v} visits/month)` : ""}: ${pageLink(t, p)}`;
      })
      .join("\n");
    const total = approx(t.visits);
    body =
      `**${pages.length} of your PageFly pages** are showing products as **OUT OF STOCK**:\n\n${list}` +
      (pages.length > 5 ? `\n• …and ${pages.length - 5} more` : "") +
      `\n\n**YOU'RE LOSING REVENUE — SHOPPERS WHO LAND ON THESE PAGES CAN'T PLACE AN ORDER.**${total ? ` Together that's **${total} visits a month** that can't turn into orders.` : ""}`;
  }
  return (
    `Hi **${storeName(t)}** 👋\n\n` +
    `This is **${cfg.sender_name}** from the PageFly team. While checking your store, we found an issue that is ⚠️ **costing you sales right now**.\n\n` +
    `${body}\n\n` +
    `👉 **Please fix it as soon as you can:** restock ${many ? "these products" : "the product"}, **point visitors to ${many ? "similar products" : "a similar product"}**, or **turn on back-in-stock notifications** — every day it stays this way means lost orders${seasonHook()}.\n\n` +
    `Reply here if you'd like a hand — we're happy to help 🙂\n\n` +
    sign(cfg)
  );
}

function defaultReview(t: Draft, cfg: RsoSettings): string {
  const names = productNames(t.pages);
  const one = names.length === 1;
  return (
    `Hi **${storeName(t)}** 👋\n\n` +
    `**${cfg.sender_name}** here again — great news: ${one ? `**${q(names[0])}** is` : "the products on your pages are"} **back in stock**, so your ${one ? "page is" : "pages are"} fully shoppable again 🎉\n\n` +
    `If PageFly has been helpful for your store, we'd really appreciate **a quick review** — it takes a minute:\n👉 ${REVIEW_URL}\n\n` +
    `It helps other merchants find us and means a lot to our team. Thanks so much, and wishing you a great season ahead!\n\n` +
    sign(cfg)
  );
}

function fill(tpl: string, t: Pick<RsoTarget, "store_name" | "store_domain" | "pages" | "visits">, cfg: RsoSettings): string {
  const first = t.pages[0];
  return tpl
    .replaceAll("{store_name}", t.store_name || t.store_domain.replace(".myshopify.com", ""))
    .replaceAll("{pic}", cfg.sender_name)
    .replaceAll("{products}", productNames(t.pages).map(q).join(", "))
    .replaceAll("{pages}", t.pages.map((p) => q(p.title)).join(", "))
    .replaceAll("{visits}", (approx(t.visits) ?? String(t.visits)))
    .replaceAll("{page_link}", first ? `https://${t.store_domain}${first.path}` : "")
    .replaceAll("{review_link}", REVIEW_URL);
}

export const composeNotify = (t: Draft, cfg: RsoSettings) => (cfg.notify_template.trim() ? fill(cfg.notify_template, t, cfg) : defaultNotify(t, cfg));
export const composeReview = (t: Draft, cfg: RsoSettings) => (cfg.review_template.trim() ? fill(cfg.review_template, t, cfg) : defaultReview(t, cfg));

/* ---------------------------------------------------------------- scan */

const segs = (s: string) =>
  new Set(
    s
      .split(",")
      .map((x) => x.trim().toLowerCase().replace(/[\s_-]+/g, ""))
      .filter(Boolean),
  );

export type ScanResult = { rows: number; taken: number; skipped: number; error?: string; notSelling?: number; tradeUnknown?: string };

/* A store that is not trading: the Radar's R2 (no orders in 60 days), its
   stage "not_selling", or no orders in its numbers. Telling it that it is
   "losing revenue" would ring false — it is left out. null: the feed says
   nothing about trading for this row. */
function notSelling(i: RadarItem): boolean | null {
  const f = i.facts ?? {};
  const said = i.signs !== undefined || f.stage !== undefined || f.orders30d !== undefined || f.orders60d !== undefined || f.noOrders !== undefined;
  if (!said) return null;
  return (
    (i.signs ?? []).some((s) => s.code === "R2") ||
    f.stage === "not_selling" ||
    f.noOrders === true ||
    f.orders60d === 0 ||
    (f.orders30d === 0 && f.orders60d === undefined && f.stage !== undefined && f.stage !== "selling")
  );
}

export async function scan(cfg: RsoSettings): Promise<ScanResult> {
  const pool = await db();
  const rows = await radarRows();
  const { rows: known } = await pool.query<{ store_domain: string }>(
    `select distinct store_domain from rso_targets where created_at > now() - make_interval(days => $1::int)`,
    [cfg.cooldown_days],
  );
  const busy = new Set(known.map((r) => r.store_domain));
  const fresh = rows
    .filter((i) => !i.goneAt && !i.outcome && i.paid !== false && !busy.has(i.shopDomain) && (!i.assignee || i.assignee === cfg.ac2_assignee))
    .map((i) => {
      const pages: RsoPage[] = (i.facts?.pages ?? []).map((p) => {
        const products = (p.products ?? []).map(clean).filter(Boolean);
        return { title: p.title, path: p.path, visits: p.sessions ?? 0, products, count: p.productCount ?? products.length };
      });
      return { i, pages, visits: i.facts?.sessions30d ?? pages.reduce((s, p) => s + p.visits, 0) };
    })
    .filter((x) => x.pages.length)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, cfg.max_per_scan);

  const blocked = segs(cfg.blocked_segments);
  let taken = 0;
  let skipped = 0;
  let notSellingN = 0;
  let unknown = 0;
  for (const { i, pages, visits } of fresh) {
    const base = { store_domain: i.shopDomain, pages, visits, radar_group: i.facts?.radarGroup ?? null, reviewed_before: !!i.facts?.reviewed };
    let skip: SkipCode | null = null;
    const store = await ac2Store(i.shopDomain).catch(() => null);
    let sid: string | null = null;
    let link: string | null = null;
    const idle = notSelling(i);
    if (idle === null) unknown++;
    if (idle) {
      skip = "not_selling";
      notSellingN++;
    } else if (visits < cfg.min_visits) skip = "low_visits";
    else if (!store) skip = "no_ac2";
    else if (store.uninstalledAt || /uninstall/i.test(store.status ?? "")) skip = "uninstalled";
    else {
      const email = store.email?.trim() || null;
      const meta = await customerMeta(email, null).catch(() => ({ segments: new Set<string>(), app_review: null }));
      if ([...meta.segments].some((s) => blocked.has(s.replace(/[\s_-]+/g, "")))) skip = "blocked_segment";
      else if (email) {
        const r = await reviewCheck(email).catch(() => null);
        sid = r?.conversations[0]?.session_id ?? null;
        if (sid) link = ticketLink(await connection("crisp_website_id"), sid);
      } else skip = "no_channel";
    }
    const draft = { store_name: store?.name ?? null, store_domain: i.shopDomain, pages, visits };
    const { rows: ins } = await pool.query<{ id: string }>(
      `insert into rso_targets (store_domain, store_name, email, pf_plan, pf_price, pages, visits, radar_group, reviewed_before,
                                session_id, ticket_link, status, skip_code, skip_reason, message, stage)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
      [
        base.store_domain,
        store?.name ?? null,
        store?.email ?? null,
        store?.pageflyPlan ?? null,
        store?.pageflyPrice != null && store.pageflyPrice !== "" ? Number(store.pageflyPrice) : null,
        JSON.stringify(pages),
        visits,
        base.radar_group,
        base.reviewed_before,
        sid,
        link,
        skip ? "skipped" : cfg.mode === "auto" ? "approved" : "pending",
        skip,
        skip ? SKIP_REASONS[skip] : null,
        skip ? null : composeNotify(draft, cfg),
        null,
      ],
    );
    await logEvent(pool, ins[0].id, skip ? "skipped" : "found", "system", skip ? { reason: skip } : { visits });
    if (skip) skipped++;
    else {
      taken++;
      await radarRecord(i.shopDomain, { note: "Radar Sold Out: đã soạn tin báo hết hàng, chờ gửi" }, cfg);
    }
  }
  /* the feed said nothing about trading on any row: name what it does carry, so the rule can be pointed at it */
  const sample = rows[0];
  const tradeUnknown =
    fresh.length && unknown === fresh.length && sample
      ? `${Object.keys(sample).join(",")} | facts: ${Object.keys(sample.facts ?? {}).join(",")}`.slice(0, 300)
      : undefined;
  return { rows: rows.length, taken, skipped, notSelling: notSellingN, tradeUnknown };
}

/* ---------------------------------------------------------------- send */

/** The private note left after a message: what was sent, and who takes the reply. */
function sentNote(t: RsoTarget, review: boolean, cfg: RsoSettings): string {
  const what = review
    ? "sent the review request (the store restocked)"
    : `told the customer a product on their PageFly page is out of stock: ${productNames(t.pages).join(", ")}`;
  return `[Radar Sold Out] ${cfg.sender_name} ${what}. If the customer replies about this, please mention @${cfg.sender_name} to handle it.`;
}

async function quiet(sid: string, minutes: number): Promise<boolean> {
  if (!minutes) return true;
  const msgs = await conversationMessages(sid).catch(() => []);
  const last = Math.max(0, ...msgs.map((m) => m.timestamp ?? 0));
  return Date.now() - last > minutes * 60_000;
}

export type SendResult = { sent: number; waited: number; failed: number };

export async function runSend(): Promise<SendResult> {
  const out: SendResult = { sent: 0, waited: 0, failed: 0 };
  if (!hasRsoDatabase() || !(await runState()).on) return out;
  const cfg = await getRsoSettings();
  const pool = await db();
  const { rows } = await pool.query<RsoTarget>(
    `select * from rso_targets where status = 'approved' or review_status = 'approved' order by updated_at limit 20`,
  );
  const sender = rows.length ? await crispSender(cfg.sender_name, "") : null;
  for (const t of rows) {
    const review = t.review_status === "approved";
    const text = (review ? t.review_message : t.message) ?? "";
    try {
      if (!text.trim()) throw new Error("Tin nhắn trống");
      /* the store's latest Crisp conversation, read now: one opened since the scan wins */
      let sid = t.session_id;
      if (t.email) {
        const latest = (await reviewCheck(t.email).catch(() => null))?.conversations[0]?.session_id ?? null;
        if (latest && latest !== sid) {
          sid = latest;
          await pool.query("update rso_targets set session_id = $2, ticket_link = $3 where id = $1", [t.id, sid, ticketLink(await connection("crisp_website_id"), sid)]);
        }
      }
      /* support may be chatting with them: wait until the conversation has been quiet for quiet_minutes */
      if (sid && !(await quiet(sid, cfg.quiet_minutes))) {
        out.waited++;
        continue;
      }
      const note = sentNote(t, review, cfg);
      if (sid) {
        await sendInConversation(sid, text, sender!);
        await sendNote(sid, note);
        await resolveConversation(sid).catch(() => undefined);
      } else if (t.email) {
        /* no conversation yet: a new one (it reaches them by email), noted and resolved */
        const created = await sendInNewConversation({
          email: t.email,
          nickname: t.store_name || t.store_domain,
          subject: cfg.subject,
          content: text,
          sender: sender!,
          note,
        });
        sid = created.session_id;
        await pool.query("update rso_targets set session_id = $2, ticket_link = $3 where id = $1", [t.id, sid, created.ticket_link]);
      } else throw new Error("Không có hội thoại Crisp hay email để gửi");

      if (review) {
        await pool.query(
          `update rso_targets set review_status = 'sent', review_asked_at = now(), review_asked_by = coalesce(review_asked_by, 'system'),
                  review_error = null, stage = 'review_asked', updated_at = now() where id = $1`,
          [t.id],
        );
        await radarRecord(t.store_domain, { outcome: "emailed", note: "Radar Sold Out: đã nhập hàng, đã xin review" }, cfg);
      } else {
        await pool.query(
          `update rso_targets set status = 'sent', sent_at = now(), sent_by = coalesce(approved_by, 'system'), error = null,
                  stage = 'waiting', updated_at = now() where id = $1`,
          [t.id],
        );
        await radarRecord(t.store_domain, { outcome: "emailed", note: `Radar Sold Out: đã báo hết hàng ${productNames(t.pages).join(", ")}` }, cfg);
      }
      await logEvent(pool, t.id, review ? "review_sent" : "sent", "system");
      out.sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await pool.query(
        review
          ? `update rso_targets set review_status = 'failed', review_error = $2, updated_at = now() where id = $1`
          : `update rso_targets set status = 'failed', error = $2, updated_at = now() where id = $1`,
        [t.id, msg],
      );
      await logEvent(pool, t.id, "send_failed", "system", { error: msg, review });
      out.failed++;
    }
  }
  return out;
}

/* ---------------------------------------------------------------- track */

const textOf = (c: unknown) => (typeof c === "string" ? c : "");

export async function track(t: RsoTarget, cfg: RsoSettings): Promise<void> {
  if (!t.session_id || !t.sent_at) return;
  const pool = await db();
  const msgs = await conversationMessages(t.session_id);
  const since = new Date(t.sent_at).getTime() - 60_000;
  const ours = msgs.filter((m) => m.from === "operator" && m.type === "text" && (m.timestamp ?? 0) >= since);
  const readAt = ours.find((m) => m.read)?.timestamp ?? null;
  const theirs = msgs.filter((m) => m.from === "user" && (m.timestamp ?? 0) >= since && textOf(m.content).trim());
  /* read on from the last message already read — about the stock or not */
  const seen = Math.max(t.reply_seen_at ? new Date(t.reply_seen_at).getTime() : 0, t.last_reply_at ? new Date(t.last_reply_at).getTime() : 0);
  /* compared by the second: the stored time loses Crisp's milliseconds, and a
     message read already must never look newer than itself (it would be read,
     and noted on Crisp, again on every run) */
  const sec = (ms: number) => Math.floor(ms / 1000);
  const fresh = theirs.filter((m) => sec(m.timestamp ?? 0) > sec(seen));
  const sets: string[] = ["tracked_at = now()", "updated_at = now()"];
  const args: unknown[] = [t.id];
  const set = (col: string, v: unknown) => {
    args.push(v);
    sets.push(`${col} = $${args.length}`);
  };
  if (readAt && !t.read_at) set("read_at", new Date(readAt).toISOString());
  if (fresh.length) {
    const last = fresh[fresh.length - 1];
    set("reply_seen_at", new Date(last.timestamp!).toISOString());
    /* the same conversation is their support chat: only what answers the heads-up counts */
    const read = await readReply(t.message ?? "", fresh.map((m) => textOf(m.content)).join("\n---\n"));
    if (read.related && read.excerpt.trim()) {
      set("last_reply_at", new Date(last.timestamp!).toISOString());
      set("last_reply_text", read.excerpt.slice(0, 1000));
      set("replies", (t.replies ?? 0) + 1);
      set("reply_intent", read.intent);
      set("mood", read.mood);
      set("mood_note", read.note || null);
      if (!t.replied_at) set("replied_at", new Date(last.timestamp!).toISOString());
      const stop = read.intent === "decline" || read.mood === "unhappy";
      if (stop) {
        set("stage", "stopped");
        set("review_status", t.review_status === "pending" || t.review_status === "approved" ? "skipped" : t.review_status);
      } else if (t.stage === "waiting") set("stage", "replied");
      /* the first reply about the stock: the sender is mentioned, once; later ones are noted */
      const who = !t.mentioned_at ? await crispSender(cfg.sender_name, "").catch(() => null) : null;
      await sendNote(
        t.session_id,
        `[Radar Sold Out] The customer replied about the out-of-stock heads-up: "${read.excerpt.slice(0, 300)}"` +
          `${read.note ? ` (${read.note})` : ""}. ${stop ? "They do not want more messages — nothing more is sent automatically." : `@${cfg.sender_name} please take it from here.`}`,
        who?.user_id ? [who.user_id] : [],
      ).catch(() => undefined);
      if (!t.mentioned_at) set("mentioned_at", new Date().toISOString());
      await logEvent(pool, t.id, "reply", "system", { intent: read.intent, mood: read.mood, by: read.by });
    } else await logEvent(pool, t.id, "reply_other", "system", { by: read.by });
  }
  await pool.query(`update rso_targets set ${sets.join(", ")} where id = $1`, args);
}

/* ---------------------------------------------------------------- check */

async function askReviewOrClose(t: RsoTarget, cfg: RsoSettings, pool: Awaited<ReturnType<typeof db>>): Promise<void> {
  const stars = t.reviewed_before ? 5 : await appReview(t.store_domain, t.email);
  const unhappy = t.mood === "unhappy" || t.reply_intent === "decline" || t.stage === "stopped";
  if (unhappy || (stars ?? 0) > 0) {
    await pool.query(
      `update rso_targets set stage = 'restocked_no_ask', restocked_at = coalesce(restocked_at, now()), checked_at = now(), app_review = $2, updated_at = now() where id = $1`,
      [t.id, stars],
    );
    await radarRecord(t.store_domain, { note: `Radar Sold Out: đã nhập hàng, không xin review (${unhappy ? "khách không vui" : "đã review"})` }, cfg);
    return;
  }
  await pool.query(
    `update rso_targets set stage = 'restocked', restocked_at = coalesce(restocked_at, now()), checked_at = now(),
            review_status = $2, review_message = $3, updated_at = now() where id = $1`,
    [t.id, cfg.mode === "auto" ? "approved" : "pending", composeReview(t, cfg)],
  );
  await logEvent(pool, t.id, "restocked", "system");
}

export async function check(cfg: RsoSettings): Promise<{ restocked: number; still: number; reviewed: number }> {
  const pool = await db();
  const out = { restocked: 0, still: 0, reviewed: 0 };
  const { rows: due } = await pool.query<RsoTarget>(
    `select * from rso_targets where status = 'sent' and stage in ('waiting', 'replied')
       and sent_at < now() - make_interval(days => $1::int) order by sent_at limit 100`,
    [cfg.check_after_days],
  );
  if (due.length) {
    const radar = new Map((await radarRows()).map((i) => [i.shopDomain, i]));
    for (const t of due) {
      const r = radar.get(t.store_domain);
      const scanned = r?.facts?.scannedAt ? new Date(r.facts.scannedAt).getTime() : 0;
      const gone = !r || !!r.goneAt;
      if (gone) {
        await askReviewOrClose(t, cfg, pool);
        out.restocked++;
      } else if (scanned > new Date(t.sent_at!).getTime()) {
        await pool.query(`update rso_targets set stage = 'still_out', checked_at = now(), updated_at = now() where id = $1`, [t.id]);
        await radarRecord(t.store_domain, { note: "Radar Sold Out: vẫn hết hàng sau khi nhắc, không nhắc lại" }, cfg);
        await logEvent(pool, t.id, "still_out", "system");
        out.still++;
      } else if (Date.now() - new Date(t.sent_at!).getTime() > (cfg.check_after_days + MANUAL_AFTER_DAYS) * DAY) {
        await pool.query(`update rso_targets set stage = 'manual', checked_at = now(), updated_at = now() where id = $1`, [t.id]);
      }
    }
  }
  const { rows: asked } = await pool.query<RsoTarget>(`select * from rso_targets where stage = 'review_asked' order by review_asked_at limit 100`);
  for (const t of asked) {
    const stars = await appReview(t.store_domain, t.email);
    if ((stars ?? 0) > 0) {
      await pool.query(`update rso_targets set stage = 'reviewed', app_review = $2, reviewed_at = now(), updated_at = now() where id = $1`, [t.id, stars]);
      await radarRecord(t.store_domain, { note: `Radar Sold Out: khách đã review ${stars}★` }, cfg);
      await logEvent(pool, t.id, "reviewed", "system", { stars });
      out.reviewed++;
    } else if (Date.now() - new Date(t.review_asked_at!).getTime() > cfg.review_wait_days * DAY) {
      await pool.query(`update rso_targets set stage = 'no_review', updated_at = now() where id = $1`, [t.id]);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- upgrades */

/**
 * The stores sent the heads-up, their PageFly plan read again on AC2: a price
 * above the one when they were taken is an upgrade, timed by AC2's charge
 * after the heads-up (else when it was seen). Once, per store.
 */
export async function checkUpgrades(): Promise<number> {
  const pool = await db();
  const { rows } = await pool.query<RsoTarget>(
    `select * from rso_targets where status = 'sent' and upgraded_at is null
       and (ac2_checked_at is null or ac2_checked_at < now() - make_interval(secs => $1::int))
     order by ac2_checked_at nulls first limit $2`,
    [Math.round(UPGRADE_EVERY_MS / 1000), UPGRADE_BATCH],
  );
  let found = 0;
  for (const t of rows) {
    const st = await ac2Store(t.store_domain).catch(() => null);
    await pool.query(`update rso_targets set ac2_checked_at = now() where id = $1`, [t.id]);
    if (!st) continue;
    const price = Number(st.pageflyPrice ?? 0) || 0;
    const before = t.pf_price === null ? 0 : Number(t.pf_price);
    if (price <= before) continue;
    const at = await ac2UpgradeTime(t.store_domain, t.sent_at).catch(() => null);
    const from = t.pf_plan ?? (before === 0 ? "Free" : `$${before}`);
    await pool.query(
      `update rso_targets set upgraded_at = $2, upgraded_from = $3, upgraded_to = $4, upgraded_price = $5, updated_at = now() where id = $1`,
      [t.id, at ?? new Date().toISOString(), from, st.pageflyPlan ?? null, price],
    );
    await logEvent(pool, t.id, "upgraded", "system", { from, to: st.pageflyPlan ?? null, price, at });
    found++;
  }
  return found;
}

/* ---------------------------------------------------------------- job */

export type JobState = {
  at: string;
  scan?: ScanResult;
  checked?: { restocked: number; still: number; reviewed: number };
  tracked?: number;
  upgraded?: number;
  errors: string[];
};

/* Once per message version: what still waits on Chờ duyệt is rewritten in the
   current form (nothing pending was sent; an admin's edit is sent with its
   approval, never stored while pending). Bump MSG_VERSION when the built-in
   messages change. */
const MSG_VERSION = "crisp-v5";

export async function refreshPendingMessages(): Promise<number> {
  if ((await getState<string>("msg_version")) === MSG_VERSION) return 0;
  const cfg = await getRsoSettings();
  const pool = await db();
  const { rows } = await pool.query<RsoTarget>(`select * from rso_targets where status = 'pending' or review_status = 'pending'`);
  for (const t of rows) {
    if (t.status === "pending") await pool.query(`update rso_targets set message = $2 where id = $1`, [t.id, composeNotify(t, cfg)]);
    if (t.review_status === "pending") await pool.query(`update rso_targets set review_message = $2 where id = $1`, [t.id, composeReview(t, cfg)]);
  }
  await setState("msg_version", MSG_VERSION);
  return rows.length;
}

let busy = false;

export async function runJob(force = false): Promise<JobState | null> {
  if (busy || !hasRsoDatabase()) return null;
  if (!(await runState()).on) return null;
  busy = true;
  const state: JobState = { at: new Date().toISOString(), errors: [] };
  try {
    await refreshPendingMessages().catch((err) => state.errors.push(`messages: ${err instanceof Error ? err.message : err}`));
    const cfg = await getRsoSettings();
    const clock = (await getState<Record<string, string>>("clock")) ?? {};
    const due = (k: string, every: number) => force || !clock[k] || Date.now() - new Date(clock[k]).getTime() >= every;
    if (due("scan", SCAN_EVERY_MS)) {
      try {
        state.scan = await scan(cfg);
      } catch (err) {
        state.errors.push(`scan: ${err instanceof Error ? err.message : err}`);
      }
      clock.scan = state.at;
    }
    if (due("track", TRACK_EVERY_MS)) {
      const { rows } = await (await db()).query<RsoTarget>(
        `select * from rso_targets where status = 'sent' and session_id is not null
           and sent_at > now() - interval '45 days' and stage not in ('stopped', 'reviewed', 'no_review') order by tracked_at nulls first limit 60`,
      );
      for (const t of rows) await track(t, cfg).catch((err) => state.errors.push(`track ${t.store_domain}: ${err instanceof Error ? err.message : err}`));
      state.tracked = rows.length;
      clock.track = state.at;
    }
    try {
      state.upgraded = await checkUpgrades();
    } catch (err) {
      state.errors.push(`upgrades: ${err instanceof Error ? err.message : err}`);
    }
    if (due("check", CHECK_EVERY_MS)) {
      try {
        state.checked = await check(cfg);
      } catch (err) {
        state.errors.push(`check: ${err instanceof Error ? err.message : err}`);
      }
      clock.check = state.at;
    }
    await setState("clock", clock);
    await setState("last_job", state);
    return state;
  } finally {
    busy = false;
  }
}

let started = false;

export function startRsoTimer(): void {
  if (started || !hasRsoDatabase() || process.env.RSO_DISABLE_TIMER === "1") return;
  started = true;
  const tick = () => {
    runJob().then(
      (r) => r?.errors.length && console.error("[rso]", JSON.stringify(r)),
      (err) => console.error("[rso] run failed", err),
    );
    runSend().catch((err) => console.error("[rso] send failed", err));
  };
  setTimeout(tick, 90_000).unref?.();
  setInterval(tick, TICK_MS).unref?.();
}

/* ---------------------------------------------------------------- admin */

export type TargetAction = "approve" | "edit" | "skip" | "retry" | "approve_review" | "edit_review" | "skip_review" | "retry_review" | "restocked" | "still_out" | "stop" | "track";

export async function targetAction(id: string, action: TargetAction, by: string, text?: string): Promise<void> {
  const pool = await db();
  const { rows } = await pool.query<RsoTarget>("select * from rso_targets where id = $1", [id]);
  const t = rows[0];
  if (!t) throw new UpsellError("Không tìm thấy store này.", 404);
  const cfg = await getRsoSettings();
  const body = text?.trim();
  const upd = (sql: string, ...args: unknown[]) => pool.query(`update rso_targets set ${sql}, updated_at = now() where id = $1`, [id, ...args]);
  switch (action) {
    case "approve":
      if (t.status !== "pending") throw new UpsellError("Tin này không còn ở Chờ duyệt.", 409);
      await upd("status = 'approved', approved_by = $2, message = coalesce($3, message)", by, body || null);
      break;
    case "edit":
      if (!body) throw new UpsellError("Nội dung trống.", 422);
      await upd("message = $2", body);
      break;
    case "skip":
      await upd("status = 'skipped', skip_code = 'admin', skip_reason = $2", SKIP_REASONS.admin);
      break;
    case "retry":
      if (t.status !== "failed") throw new UpsellError("Chỉ gửi lại được tin bị lỗi.", 409);
      await upd("status = 'approved', error = null");
      break;
    case "approve_review":
      if (t.review_status !== "pending") throw new UpsellError("Tin xin review không còn ở Chờ duyệt.", 409);
      await upd("review_status = 'approved', review_asked_by = $2, review_message = coalesce($3, review_message)", by, body || null);
      break;
    case "edit_review":
      if (!body) throw new UpsellError("Nội dung trống.", 422);
      await upd("review_message = $2", body);
      break;
    case "skip_review":
      await upd("review_status = 'skipped', stage = 'restocked_no_ask'");
      break;
    case "retry_review":
      if (t.review_status !== "failed") throw new UpsellError("Chỉ gửi lại được tin bị lỗi.", 409);
      await upd("review_status = 'approved', review_error = null");
      break;
    case "restocked":
      await askReviewOrClose(t, cfg, pool);
      break;
    case "still_out":
      await upd("stage = 'still_out', checked_at = now()");
      break;
    case "stop":
      await upd("stage = 'stopped', review_status = case when review_status in ('pending','approved') then 'skipped' else review_status end");
      break;
    case "track":
      await track(t, cfg);
      break;
  }
  await logEvent(pool, id, action, by, body ? { text: body.slice(0, 200) } : null);
}
