import "server-only";

import { getRepo } from "@/lib/db";
import { fillTemplate, longDate, newMessageId } from "@/lib/upsell/common";
import { UpsellError } from "@/lib/upsell/types";
import { reviewCheck, sendInConversation, sendInNewConversation } from "./clients";
import { db, logEvent, tx, type Db } from "./db";
import { getSsuSettings, type SsuSettings } from "./settings";
import { titleOfSlug, type SsuCustomer, type SsuMessage, type SsuMessageKind } from "./types";

/* ==========================================================================
   The messages: written from a template, approved by an admin (or by the
   mode, in advance), sent on Crisp from {sender_name} — Logan by default.

   THE 5-STAR RULE IS CHECKED TWICE: when the customer is first seen, and
   again right before anything is sent, because a review given in between
   must stop a "please review us" — or a thank-you — that was approved
   yesterday.
   ========================================================================== */

/* Same shape as the Upsell Build Pages messages (common.ts): greeting with the
   store in bold, short paragraphs, the key words bold, a bold signature. */
export const DEFAULT_THANKS_TEMPLATE =
  "Hi **{store_name}**,\n\n" +
  "Thank you for choosing the **{set_name}** store set from PageFly's templates! 🎉 We hope it gives your store a great new look.\n\n" +
  "To help you make it truly yours, we also offer **Complimentary Editing** services for your {set_name} pages: tell us what you would like " +
  "changed — text, images, colors or sections — and our team will make the edits for you.\n" +
  "(Please note that this is a **Free Editing** service, available for a limited period of **15 days** — until **{edit_until}**.)\n\n" +
  "👉 **Simply reply to this message** with the changes you need, and we will take care of it.\n\n" +
  "If you need any assistance, simply reply to this message.\n\n" +
  "Best regards,\n**{pic} – PageFly Support**";

export const DEFAULT_REVIEW_TEMPLATE =
  "Hi **{store_name}**,\n\n" +
  "Thank you for building your store with the **{set_name}** set — it means a lot to our team! 🙌\n\n" +
  "If PageFly has been helpful so far, would you mind leaving us a quick review on the Shopify App Store? " +
  "It takes about 30 seconds and helps other merchants find us.\n\n" +
  "👉 [Leave a review]({review_url})\n\n" +
  "And if you need anything else for your pages, just reply here.\n\n" +
  "Best regards,\n**{pic} – PageFly Support**";

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

/** The set the customer picked most recently. */
export async function latestSet(c: Db, domain: string): Promise<string | null> {
  const { rows } = await c.query<{ store_set: string }>(
    "select store_set from ssu_selections where store_domain = $1 order by event_time desc limit 1",
    [domain],
  );
  return rows[0]?.store_set ?? null;
}

export async function messageFor(kind: SsuMessageKind, cu: Pick<SsuCustomer, "store_name" | "store_domain">, set: string | null, cfg: SsuSettings): Promise<string> {
  const tpl =
    kind === "review_ask" ? cfg.review_template.trim() || DEFAULT_REVIEW_TEMPLATE : cfg.thanks_template.trim() || DEFAULT_THANKS_TEMPLATE;
  return fillTemplate(tpl, {
    store_name: cu.store_name?.trim() || cu.store_domain.replace(/\.myshopify\.com$/, ""),
    set_name: await setName(set),
    pic: cfg.sender_name || "Logan",
    review_url: cfg.review_url,
    edit_until: longDate(new Date(Date.now() + cfg.edit_days * 86_400_000).toISOString()),
  });
}

export async function sampleMessage(kind: SsuMessageKind, cfg: SsuSettings): Promise<string> {
  return messageFor(kind, { store_name: "Your Store", store_domain: "your-store.myshopify.com" }, "aurum", cfg);
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
  const content = o.content ?? (await messageFor(kind, cu, await latestSet(c, cu.store_domain), cfg));
  const id = newMessageId();
  const ins = await c.query(
    `insert into ssu_messages (id, store_domain, kind, content, status, created_by, approved_by, approved_at)
     values ($1, $2, $3, $4, $5, $6, $7, case when $8 then now() end)
     on conflict (store_domain, kind) where kind <> 'custom' do nothing returning id`,
    [id, cu.store_domain, kind, content, o.auto ? "approved" : "pending_review", o.actor, o.auto ? "auto" : null, o.auto],
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
    await c.query(
      `update ssu_messages set status = 'approved', approved_by = $2, approved_at = now(), error = null,
              content = coalesce(nullif($3, ''), content) where id = $1`,
      [id, actor, content?.trim() ?? ""],
    );
    if (m.kind === "thanks") await c.query("update ssu_customers set status = 'approved', updated_at = now() where store_domain = $1", [m.store_domain]);
    await logEvent(c, m.store_domain, "message_approved", actor, { message_id: id, kind: m.kind });
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

  const set = await latestSet(p, m.store_domain);
  const name = cu.store_name?.trim() || cu.store_domain.replace(/\.myshopify\.com$/, "");
  let session = cu.crisp_session;
  let ticket = cu.ticket_link;
  try {
    if (session && m.kind !== "thanks") {
      await sendInConversation(session, m.content, cfg.sender_name || "Logan");
    } else {
      const r = await sendInNewConversation({
        email: cu.email,
        nickname: name,
        subject: `Your ${await setName(set)} store set — free editing`,
        content: m.content,
        sender: cfg.sender_name || "Logan",
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
