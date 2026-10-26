import "server-only";

import { getRepo } from "@/lib/db";
import { fillTemplate, longDate, newMessageId } from "@/lib/upsell/common";
import { UpsellError } from "@/lib/upsell/types";
import { conversationMessages, crispSender, resolveConversation, reviewCheck, sendInConversation, sendInNewConversation } from "./clients";
import { db, logEvent, tx, type Db } from "./db";
import { getSsuSettings, type SsuSettings } from "./settings";
import { CARE_KINDS, titleOfSlug, type SsuCustomer, type SsuMessage, type SsuMessageKind } from "./types";

/* ==========================================================================
   The messages: written from a template, approved by an admin (or by the
   mode, in advance), sent on Crisp from {sender_name} — Logan by default.

   THE 5-STAR RULE IS CHECKED TWICE: when the customer is first seen, and
   again right before anything is sent, because a review given in between
   must stop a "please review us" — or a thank-you — that was approved
   yesterday.
   ========================================================================== */

/* Same shape as the Upsell Build Pages messages (common.ts): greeting with the
   store in bold, short paragraphs, the key words bold, a bold signature.

   WHAT THE FREE EDITING COVERS IS SAID IN EVERY MESSAGE THAT OFFERS IT: 15
   days from the day the thanks is sent, and only the pages of the store set
   they are using — {pages} names them — never the rest of the store. */
export const DEFAULT_THANKS_TEMPLATE =
  "Hi **{store_name}**,\n\n" +
  "Thank you for choosing the **{set_name}** store set from PageFly's templates! 🎉 We hope it gives your store a great new look.\n\n" +
  "To help you make it truly yours, we offer **Complimentary Editing** for the store set pages you are using: {pages}. " +
  "Tell us what you would like changed — text, images, colors or sections — and our team will make the edits for you.\n\n" +
  "Please note:\n" +
  "• This **Free Editing** service is available for **{edit_days} days from today** — until **{edit_until}**.\n" +
  "• It covers only the pages from the **{set_name}** store set that you are using, not other pages in your store.\n\n" +
  "👉 **Simply reply to this message** with the changes you need, and we will take care of it.\n\n" +
  "Best regards,\n**{pic} – PageFly Support**";

/** Sent the thanks, no reply: the days left, and for which pages. */
export const DEFAULT_EDIT_REMINDER_TEMPLATE =
  "Hi **{store_name}**,\n\n" +
  "A quick reminder: your **Free Editing** service for the store set pages you are using — {pages} — " +
  "has only **{days_left} days left** (until **{edit_until}**).\n\n" +
  "If there is anything you would like adjusted — text, images, colors or layout — just **reply to this message** and our team will help you.\n" +
  "(Free editing covers only the pages from the **{set_name}** store set, not other pages in your store.)\n\n" +
  "Best regards,\n**{pic} – PageFly Support**";

/** Read the thanks, no reply: a check-in that asks for an answer. */
export const DEFAULT_CARE_READ_TEMPLATE =
  "Hi **{store_name}**,\n\n" +
  "Just checking in — how are the **{set_name}** pages working for your store so far? 😊\n\n" +
  "If you would like anything changed on {pages}, or you are not sure how to customize something in PageFly, " +
  "**reply here** and I will help you right away. Your free editing for these pages is available until **{edit_until}**.\n\n" +
  "Best regards,\n**{pic} – PageFly Support**";

/** Upgraded, no reply: thanks, and an open door. */
export const DEFAULT_CARE_UPGRADED_TEMPLATE =
  "Hi **{store_name}**,\n\n" +
  "Thank you for upgrading to the **{plan}** plan! 🎉 We really appreciate your trust in PageFly.\n\n" +
  "I would be happy to help you get the most out of it — whether that is polishing your **{set_name}** pages or building a new one. " +
  "Just **reply to this message** and tell me what you have in mind.\n\n" +
  "Best regards,\n**{pic} – PageFly Support**";

export const DEFAULT_REVIEW_TEMPLATE =
  "Hi **{store_name}**,\n\n" +
  "Thank you for building your store with the **{set_name}** set — it means a lot to our team! 🙌\n\n" +
  "If PageFly has been helpful so far, would you mind leaving us a quick review on the Shopify App Store? " +
  "It takes about 30 seconds and helps other merchants find us.\n\n" +
  "👉 [Leave a review]({review_url})\n\n" +
  "And if you need anything else for your pages, just reply here.\n\n" +
  "Best regards,\n**{pic} – PageFly Support**";

const DEFAULTS: Record<SsuMessageKind, [keyof SsuSettings | null, string]> = {
  thanks: ["thanks_template", DEFAULT_THANKS_TEMPLATE],
  edit_reminder: ["edit_reminder_template", DEFAULT_EDIT_REMINDER_TEMPLATE],
  care_read: ["care_read_template", DEFAULT_CARE_READ_TEMPLATE],
  care_upgraded: ["care_upgraded_template", DEFAULT_CARE_UPGRADED_TEMPLATE],
  review_ask: ["review_template", DEFAULT_REVIEW_TEMPLATE],
  custom: [null, ""],
};

let setNames: { at: number; names: Map<string, string> } | null = null;

/** Reads our set names (cached 10 minutes). Called before a transaction
    that writes a message, so the repository's read is not made inside it. */
export async function loadSetNames(): Promise<void> {
  if (setNames && Date.now() - setNames.at <= 600_000) return;
  const sets = await getRepo()
    .listCollectionSets()
    .catch(() => []);
  setNames = { at: Date.now(), names: new Map(sets.map((s) => [s.slug, s.name])) };
}

/** Our own name for a set slug ("aurum" → "Aurum"). */
export async function setName(slug: string | null | undefined): Promise<string> {
  if (!slug) return "PageFly";
  await loadSetNames();
  return setNames?.names.get(slug) ?? titleOfSlug(slug);
}

/** What a message is written from, besides the customer's row: the sets
    and the store set pages they picked (every select, in the order made). */
export type MessageContext = { sets: string[]; pages: string[] };

export async function messageContext(c: Db, domain: string): Promise<MessageContext> {
  const { rows } = await c.query<{ store_set: string; page: string }>(
    `select store_set, coalesce(template_id, initcap(replace(store_set, '-', ' ')) || ' · ' || coalesce(page_type, 'page')) as page,
            min(event_time) as first
       from ssu_selections where store_domain = $1
      group by 1, 2 order by first`,
    [domain],
  );
  return { sets: [...new Set(rows.map((r) => r.store_set))], pages: [...new Set(rows.map((r) => r.page))] };
}

const DAY = 86_400_000;

/** The last day of the free editing: `edit_days` from the thanks being sent —
    or from now, for a thanks not sent yet. */
export function editUntil(cu: Pick<SsuCustomer, "sent_at">, cfg: SsuSettings): Date {
  const base = cu.sent_at ? new Date(cu.sent_at).getTime() : Date.now();
  return new Date(base + cfg.edit_days * DAY);
}

export function daysLeft(cu: Pick<SsuCustomer, "sent_at">, cfg: SsuSettings): number {
  return Math.max(0, Math.ceil((editUntil(cu, cfg).getTime() - Date.now()) / DAY));
}

type MessageCustomer = Pick<SsuCustomer, "store_name" | "store_domain" | "sent_at" | "pf_plan" | "upgraded_to">;

export async function messageFor(kind: SsuMessageKind, cu: MessageCustomer, ctx: MessageContext, cfg: SsuSettings): Promise<string> {
  const [key, fallback] = DEFAULTS[kind];
  const tpl = (key ? String(cfg[key] ?? "").trim() : "") || fallback;
  /* A thanks is about to be sent: its days start today. */
  const from = kind === "thanks" ? { sent_at: null } : cu;
  const names = await Promise.all((ctx.sets.length ? ctx.sets : [null]).map((s) => setName(s)));
  return fillTemplate(tpl, {
    store_name: cu.store_name?.trim() || cu.store_domain.replace(/\.myshopify\.com$/, ""),
    set_name: names.join(" & "),
    pages: ctx.pages.length ? ctx.pages.map((p) => `**${p}**`).join(", ") : `your **${names.join(" & ")}** pages`,
    page_count: String(ctx.pages.length),
    edit_days: String(cfg.edit_days),
    edit_until: longDate(editUntil(from, cfg).toISOString()),
    days_left: String(daysLeft(from, cfg)),
    plan: cu.upgraded_to || cu.pf_plan || "new",
    pic: cfg.sender_name || "Logan",
    review_url: cfg.review_url,
  });
}

export async function sampleMessage(kind: SsuMessageKind, cfg: SsuSettings): Promise<string> {
  const sent = new Date(Date.now() - (cfg.edit_days - cfg.edit_reminder_days_left) * DAY).toISOString();
  return messageFor(
    kind,
    { store_name: "Your Store", store_domain: "your-store.myshopify.com", sent_at: kind === "thanks" ? null : sent, pf_plan: "Optimize", upgraded_to: null },
    { sets: ["aurum"], pages: ["Aurum · Home", "Aurum · Product", "Aurum · About"] },
    cfg,
  );
}

/**
 * Writes a message for a customer. `auto` writes it approved. One thanks and
 * one review ask per store, ever (the unique index) — a second call answers
 * null. The customer's status follows a thanks message only.
 */
export async function draft(
  c: Db,
  cu: SsuCustomer,
  kind: SsuMessageKind,
  o: { auto: boolean; actor: string; content?: string; cfg?: SsuSettings },
): Promise<string | null> {
  const cfg = o.cfg ?? (await getSsuSettings());
  const content = o.content ?? (await messageFor(kind, cu, await messageContext(c, cu.store_domain), cfg));
  const id = newMessageId();
  /* `rerender`: written from the template, so it is written again at send
     time — the dates, the days left and the pages are those of the day it
     goes, not of the day it was drafted. An admin's edit turns it off. */
  const ins = await c.query(
    `insert into ssu_messages (id, store_domain, kind, content, status, created_by, approved_by, approved_at, rerender)
     values ($1, $2, $3, $4, $5, $6, $7, case when $8 then now() end, $9)
     on conflict (store_domain, kind) where kind <> 'custom' do nothing returning id`,
    [id, cu.store_domain, kind, content, o.auto ? "approved" : "pending_review", o.actor, o.auto ? "auto" : null, o.auto, o.content === undefined],
  );
  if (!ins.rows[0]) return null;
  if (kind === "thanks") {
    await c.query("update ssu_customers set status = $2, skip_reason = null, updated_at = now() where store_domain = $1", [
      cu.store_domain,
      o.auto ? "approved" : "pending_review",
    ]);
  }
  await logEvent(c, cu.store_domain, "message_drafted", o.actor, { message_id: id, kind, auto: o.auto });
  return id;
}

async function loadMessage(c: Db, id: string, lock = false): Promise<SsuMessage> {
  const { rows } = await c.query<SsuMessage>(`select * from ssu_messages where id = $1${lock ? " for update" : ""}`, [id]);
  if (!rows[0]) throw new UpsellError("Không có tin này.", 404);
  return rows[0];
}

export async function approve(id: string, content: string | null, actor: string): Promise<void> {
  await tx(async (c) => {
    const m = await loadMessage(c, id, true);
    if (m.status !== "pending_review" && m.status !== "failed") throw new UpsellError("Tin này không còn chờ duyệt.", 409);
    const edited = !!content?.trim() && content.trim() !== m.content.trim();
    await c.query(
      `update ssu_messages set status = 'approved', approved_by = $2, approved_at = now(), error = null,
              content = coalesce(nullif($3, ''), content), rerender = rerender and not $4 where id = $1`,
      [id, actor, content?.trim() ?? "", edited],
    );
    if (m.kind === "thanks") await c.query("update ssu_customers set status = 'approved', updated_at = now() where store_domain = $1", [m.store_domain]);
    await logEvent(c, m.store_domain, "message_approved", actor, { message_id: id, kind: m.kind });
  });
}

/** Back to Chờ duyệt: an approved message not sent yet, or one rejected. */
export async function unapprove(id: string, actor: string): Promise<void> {
  await tx(async (c) => {
    const m = await loadMessage(c, id, true);
    if (m.status !== "approved" && m.status !== "rejected" && m.status !== "failed")
      throw new UpsellError(m.status === "sent" || m.status === "sending" ? "Tin đã gửi, không đưa về được." : "Tin này đã ở Chờ duyệt.", 409);
    await c.query("update ssu_messages set status = 'pending_review', approved_at = null, approved_by = null where id = $1", [id]);
    if (m.kind === "thanks")
      await c.query(
        "update ssu_customers set status = 'pending_review', skip_reason = null, updated_at = now() where store_domain = $1 and sent_at is null",
        [m.store_domain],
      );
    await logEvent(c, m.store_domain, "message_unapproved", actor, { message_id: id, kind: m.kind, from: m.status });
  });
}

export async function reject(id: string, actor: string): Promise<void> {
  await tx(async (c) => {
    const m = await loadMessage(c, id, true);
    if (m.status === "sent" || m.status === "sending") throw new UpsellError("Tin đã gửi, không bỏ được.", 409);
    await c.query("update ssu_messages set status = 'rejected' where id = $1", [id]);
    if (m.kind === "thanks")
      await c.query("update ssu_customers set status = 'skipped', skip_reason = 'Admin bỏ tin', updated_at = now() where store_domain = $1", [
        m.store_domain,
      ]);
    await logEvent(c, m.store_domain, "message_rejected", actor, { message_id: id, kind: m.kind });
  });
}

export type SendOutcome = "sent" | "failed" | "blocked_review" | "skipped";

/**
 * Sends one approved message. Claimed first (approved → sending) so the
 * minute job and an admin's "Gửi ngay" can never both send it.
 */
export async function sendOne(id: string, actor = "system"): Promise<SendOutcome> {
  const p = await db();
  const claimed = await p.query<SsuMessage>(
    "update ssu_messages set status = 'sending' where id = $1 and status = 'approved' returning *",
    [id],
  );
  const m = claimed.rows[0];
  if (!m) return "skipped";
  const cfg = await getSsuSettings();
  const { rows } = await p.query<SsuCustomer>("select * from ssu_customers where store_domain = $1", [m.store_domain]);
  const cu = rows[0];
  const fail = async (error: string) => {
    await tx(async (c) => {
      await c.query("update ssu_messages set status = 'failed', error = $2, attempts = attempts + 1, failed_at = now() where id = $1", [id, error]);
      if (m.kind === "thanks") await c.query("update ssu_customers set status = 'failed', updated_at = now() where store_domain = $1", [m.store_domain]);
      await logEvent(c, m.store_domain, "message_failed", actor, { message_id: id, kind: m.kind, error });
    });
    return "failed" as const;
  };
  if (!cu?.email) return fail("Không có email");

  /* The rule, once more, right before it reaches the customer. */
  let review;
  try {
    review = await reviewCheck(cu.email);
  } catch (err) {
    return fail(`Không kiểm tra được review trên Crisp: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (review.app_review !== null && review.app_review >= 5) {
    await tx(async (c) => {
      await c.query("update ssu_messages set status = 'rejected', error = 'Khách đã review 5★ trước khi gửi' where id = $1", [id]);
      await c.query(
        `update ssu_customers set app_review = $2, crisp_checked_at = now(), crisp_conversations = $3, crisp_sessions = $4::jsonb,
                reviewed_at = case when sent_at is not null then coalesce(reviewed_at, now()) else reviewed_at end,
                status = case when status in ('approved', 'pending_review', 'failed') then 'reviewed' else status end,
                skip_reason = case when status in ('approved', 'pending_review', 'failed') then 'Đã review 5★ trên Crisp' else skip_reason end,
                updated_at = now()
          where store_domain = $1`,
        [m.store_domain, review.app_review, review.conversations.length, JSON.stringify(review.conversations.slice(0, 20))],
      );
      await logEvent(c, m.store_domain, "blocked_by_review", actor, { message_id: id, app_review: review.app_review });
    });
    return "blocked_review";
  }

  const drop = async (reason: string, patch = "") => {
    await tx(async (c) => {
      await c.query("update ssu_messages set status = 'rejected', error = $2 where id = $1", [id, reason]);
      if (patch) await c.query(`update ssu_customers set ${patch}, updated_at = now() where store_domain = $1`, [m.store_domain]);
      await logEvent(c, m.store_domain, "message_dropped", actor, { message_id: id, kind: m.kind, reason });
    });
    return "skipped" as const;
  };

  /* A care message is for a customer who has not answered: one who has, since
     it was drafted, gets a person instead — the message is dropped and the
     store goes to Cần kiểm tra. And a reminder of days left needs days left. */
  if ((CARE_KINDS as readonly string[]).includes(m.kind)) {
    if (!cu.crisp_session) return fail("Chưa có hội thoại Crisp của tin cảm ơn");
    let msgs;
    try {
      msgs = await conversationMessages(cu.crisp_session);
    } catch (err) {
      return fail(`Không đọc được hội thoại Crisp: ${err instanceof Error ? err.message : String(err)}`);
    }
    const since = cu.sent_at ? new Date(cu.sent_at).getTime() : 0;
    if (cu.replied || msgs.some((x) => x.from === "user" && Number(x.timestamp) >= since))
      return drop("Khách đã phản hồi — chăm sóc trực tiếp", "replied = true, needs_check = true");
    if (m.kind === "edit_reminder" && daysLeft(cu, cfg) <= 0) return drop("Đã hết hạn chỉnh sửa miễn phí");
  }

  const ctx = await messageContext(p, m.store_domain);
  const set = ctx.sets[ctx.sets.length - 1] ?? null;
  let content = m.content;
  if (m.rerender) {
    content = await messageFor(m.kind, cu, ctx, cfg);
    await p.query("update ssu_messages set content = $2 where id = $1", [id, content]);
  }
  const name = cu.store_name?.trim() || cu.store_domain.replace(/\.myshopify\.com$/, "");
  let session = cu.crisp_session;
  let ticket = cu.ticket_link;
  try {
    const sender = await crispSender(cfg.sender_name || "Logan", cfg.sender_avatar);
    /* One conversation per customer for everything the upsell sends: once
       there is one (even from a message written by hand before the thanks),
       every later message — the thanks included — goes into it. */
    if (session) {
      await sendInConversation(session, content, sender);
      await resolveConversation(session);
    } else {
      const r = await sendInNewConversation({
        email: cu.email,
        nickname: name,
        subject: `Your ${await setName(set)} store set — free editing`,
        content,
        sender,
        note:
          `Store set upsell (${set ?? "?"}) — ${cfg.sender_name || "Logan"} sent: ${m.kind}. ` +
          `Customer picked a Store set template in PageFly. If they reply, please mention ${cfg.sender_name || "Logan"}.`,
      });
      session = r.session_id;
      ticket = r.ticket_link;
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }

  await tx(async (c) => {
    await c.query("update ssu_messages set status = 'sent', sent_at = now(), error = null where id = $1", [id]);
    if (m.kind === "thanks") {
      await c.query(
        `update ssu_customers set status = 'sent', sent_at = now(), crisp_session = $2, ticket_link = $3,
                app_review = coalesce($4, app_review), price_at_send = pf_price, pages_at_send = pages,
                published_at_send = published, updated_at = now()
          where store_domain = $1`,
        [m.store_domain, session, ticket, review.app_review],
      );
    } else {
      await c.query(
        `update ssu_customers set crisp_session = coalesce(crisp_session, $2), ticket_link = coalesce(ticket_link, $3),
                review_asked_at = case when $4 then now() else review_asked_at end, updated_at = now()
          where store_domain = $1`,
        [m.store_domain, session, ticket, m.kind === "review_ask"],
      );
    }
    await logEvent(c, m.store_domain, "message_sent", actor, { message_id: id, kind: m.kind, crisp_session: session });
  });
  return "sent";
}
