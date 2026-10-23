import "server-only";

import { db, tx } from "./db";
import { designUrl, newMessageId, recordEvent, recordStatus, ttlDays, isoOrNull, type Actor } from "./common";
import { lockLead, updateLead } from "./leads";
import { notifySlack } from "./notify";
import { MESSAGE_KINDS, UpsellError, type LeadRow, type MessageKind, type MessageRow, type SendMode } from "./types";

/* ==========================================================================
   Messages to the customer.

   THE RULE: nothing reaches a customer without an admin pressing approve. The
   script only ever reads `status = approved`; every path into `approved` below
   takes an admin actor, and the drafts the script writes land in
   `pending_review`.
   ========================================================================== */

async function lockMessage(c: import("pg").PoolClient, id: string): Promise<MessageRow> {
  const { rows } = await c.query<MessageRow>("select * from upsell_messages where id = $1 for update", [id]);
  if (!rows[0]) throw new UpsellError(`Message ${id} not found.`, 404);
  return rows[0];
}

/* ---- drafts from the script --------------------------------------------- */

export type DraftResult = { created: string[]; skipped: { lead_id: string; kind: string; reason: string }[] };

/** `POST /messages`. A `(lead, kind)` that already has a message — in any
    status — is skipped, so a script run that overlaps the last cannot draft
    the same follow-up twice. */
export async function createDrafts(items: unknown[], actor: Actor = "claude"): Promise<DraftResult> {
  const out: DraftResult = { created: [], skipped: [] };
  const p = await db();
  for (const raw of items) {
    const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const leadId = String(m.lead_id ?? "");
    const kind = String(m.kind ?? "");
    const content = typeof m.content === "string" ? m.content.trim() : "";
    const skip = (reason: string) => out.skipped.push({ lead_id: leadId, kind, reason });
    if (!leadId || !content) {
      skip("lead_id and content are required");
      continue;
    }
    /* The first message is created by an admin approving the pages, never
       drafted from outside — that is the review step itself. */
    if (!(MESSAGE_KINDS as readonly string[]).includes(kind) || kind === "initial") {
      skip("kind must be followup1, followup2, review or custom");
      continue;
    }
    const lead = await p.query("select 1 from upsell_leads where lead_id = $1", [leadId]);
    if (!lead.rows[0]) {
      skip("unknown lead");
      continue;
    }
    const id = newMessageId();
    const ins = await p.query(
      `insert into upsell_messages (id, lead_id, kind, content, status, created_by)
       values ($1,$2,$3,$4,'pending_review',$5)
       on conflict (lead_id, kind) where kind <> 'custom' do nothing
       returning id`,
      [id, leadId, kind, content.slice(0, 20_000), actor],
    );
    if (!ins.rows[0]) {
      skip("already has a message of this kind");
      continue;
    }
    await recordEvent(p, { lead_id: leadId, type: "message_drafted", actor, detail: { message_id: id, kind } });
    out.created.push(id);
  }
  if (out.created.length) void notifySlack("message").catch(() => undefined);
  return out;
}

/* ---- what the script sends ---------------------------------------------- */

export type OutgoingMessage = Pick<MessageRow, "id" | "lead_id" | "kind" | "content" | "send_mode" | "approved_at"> & {
  lead: {
    store_domain: string;
    store_name: string | null;
    email: string | null;
    timezone: string | null;
    crisp_session: string | null;
    design_url: string | null;
  };
};

/** `GET /messages?status=approved`. Approved, not sent, for a lead still
    installed. A follow-up or review ask goes only into an existing
    conversation — without one there is nothing to follow up on. */
export async function approvedForSending(): Promise<OutgoingMessage[]> {
  const p = await db();
  const { rows } = await p.query(
    `select m.id, m.lead_id, m.kind, m.content, m.send_mode, m.approved_at,
            l.store_domain, l.store_name, l.email, l.timezone, l.crisp_session, d.id as design_id
       from upsell_messages m
       join upsell_leads l on l.lead_id = m.lead_id
       left join upsell_designs d on d.lead_id = l.lead_id
      where m.status = 'approved'
        and l.status <> 'uninstalled'
        and coalesce(l.app_status, '') <> 'uninstalled'
        and (m.kind not in ('followup1', 'followup2', 'review', 'view_reminder', 'edit_offer') or l.crisp_session is not null)
      order by (m.send_mode = 'now') desc, m.approved_at asc`,
  );
  return rows.map((r) => ({
    id: r.id,
    lead_id: r.lead_id,
    kind: r.kind,
    content: r.content,
    send_mode: r.send_mode,
    approved_at: r.approved_at,
    lead: {
      store_domain: r.store_domain,
      store_name: r.store_name,
      email: r.email,
      timezone: r.timezone,
      crisp_session: r.crisp_session,
      design_url: r.design_id ? designUrl(r.design_id) : null,
    },
  }));
}

/* ---- the script reports back -------------------------------------------- */

const SENT_COLUMN: Partial<Record<MessageKind, keyof LeadRow>> = {
  followup1: "followup1_at",
  followup2: "followup2_at",
  review: "review_asked_at",
};

export type ResultBody = {
  status: "sent" | "failed";
  error?: string | null;
  sent_at?: string | null;
  crisp_session?: string | null;
  ticket_link?: string | null;
  plan_at_send?: string | null;
  price_at_send?: number | null;
  pages_at_send?: number | null;
  published_at_send?: number | null;
};

/** `POST /messages/:id/result`. Idempotent: a message already sent stays
    exactly as it is, whatever a second report says. */
export async function reportResult(id: string, body: ResultBody, actor: Actor = "claude"): Promise<{ changed: boolean; message: MessageRow }> {
  if (body.status !== "sent" && body.status !== "failed") throw new UpsellError("status must be sent or failed.", 422);
  const out = await recordResult(id, body, actor);
  /* A new failure is something to act on: Slack, within its 15-minute window. */
  if (out.changed && out.message.status === "failed") void notifySlack("failed").catch(() => undefined);
  return out;
}

async function recordResult(id: string, body: ResultBody, actor: Actor): Promise<{ changed: boolean; message: MessageRow }> {
  return tx(async (c) => {
    const m = await lockMessage(c, id);
    if (m.status === "sent") return { changed: false, message: m };
    if (m.status === "failed" && body.status === "failed") return { changed: false, message: m };
    if (m.status !== "approved" && m.status !== "failed")
      throw new UpsellError(`Message ${id} is ${m.status}; only an approved message can be reported.`, 409);

    if (body.status === "failed") {
      const error = String(body.error ?? "unknown error").slice(0, 1000);
      const { rows } = await c.query<MessageRow>(
        `update upsell_messages set status = 'failed', error = $2, attempts = attempts + 1, failed_at = now()
          where id = $1 returning *`,
        [id, error],
      );
      await recordEvent(c, {
        lead_id: m.lead_id,
        type: "message_failed",
        actor,
        detail: { message_id: id, kind: m.kind, error, attempt: rows[0].attempts },
      });
      return { changed: true, message: rows[0] };
    }

    const sentAt = isoOrNull(body.sent_at) ?? new Date().toISOString();
    await c.query("update upsell_messages set status = 'sent', sent_at = $2, error = null where id = $1", [id, sentAt]);
    await recordEvent(c, { lead_id: m.lead_id, type: "message_sent", actor, detail: { message_id: id, kind: m.kind } });

    const lead = await lockLead(c, m.lead_id);
    const set: Record<string, unknown> = {};
    if (body.crisp_session && !lead.crisp_session) set.crisp_session = body.crisp_session;
    if (body.ticket_link && !lead.ticket_link) set.ticket_link = body.ticket_link;

    if (m.kind === "initial") {
      set.sent_at = sentAt;
      for (const k of ["plan_at_send", "price_at_send", "pages_at_send", "published_at_send"] as const) {
        if (body[k] !== undefined && body[k] !== null) set[k] = body[k];
      }
      if (lead.status === "approved") set.status = "sent";
      /* The link lives for TTL days from the moment the customer got it. */
      await c.query("update upsell_designs set expires_at = $2::timestamptz + make_interval(days => $3) where lead_id = $1", [
        lead.lead_id,
        sentAt,
        ttlDays(),
      ]);
    } else {
      const col = SENT_COLUMN[m.kind];
      if (col) set[col] = sentAt;
    }
    await updateLead(c, lead.lead_id, set);
    if (set.status) await recordStatus(c, lead.lead_id, lead.status, String(set.status), actor);
    return { changed: true, message: { ...m, status: "sent", sent_at: sentAt } };
  });
}

/* ---- admin actions -------------------------------------------------------- */

export async function approveMessage(
  id: string,
  opts: { content?: string | null; send_mode?: SendMode },
  actor: Actor,
): Promise<void> {
  await tx(async (c) => {
    const m = await lockMessage(c, id);
    if (m.status !== "pending_review" && m.status !== "failed")
      throw new UpsellError(`Message ${id} is ${m.status}; only a draft or a failed message can be approved.`, 409);
    const content = opts.content?.trim() || m.content;
    await c.query(
      `update upsell_messages set status = 'approved', content = $2, send_mode = $3, approved_by = $4, approved_at = now(), error = null
        where id = $1`,
      [id, content, opts.send_mode === "now" ? "now" : "window", actor],
    );
    await recordEvent(c, {
      lead_id: m.lead_id,
      type: "message_approved",
      actor,
      detail: { message_id: id, kind: m.kind, send_mode: opts.send_mode ?? "window", edited: content !== m.content },
    });
  });
}

export async function rejectMessage(id: string, actor: Actor): Promise<void> {
  await tx(async (c) => {
    const m = await lockMessage(c, id);
    if (m.status !== "pending_review" && m.status !== "failed")
      throw new UpsellError(`Message ${id} is ${m.status}; it cannot be dropped.`, 409);
    await c.query("update upsell_messages set status = 'rejected' where id = $1", [id]);
    await recordEvent(c, { lead_id: m.lead_id, type: "message_rejected", actor, detail: { message_id: id, kind: m.kind } });
  });
}

/** "Gửi ngay" on the waiting list: the script sends it on its next run,
    whatever the hour is where the customer is. */
export async function sendNow(id: string, actor: Actor): Promise<void> {
  await tx(async (c) => {
    const m = await lockMessage(c, id);
    if (m.status !== "approved") throw new UpsellError(`Message ${id} is ${m.status}, not waiting to send.`, 409);
    await c.query("update upsell_messages set send_mode = 'now' where id = $1", [id]);
    await recordEvent(c, { lead_id: m.lead_id, type: "message_approved", actor, detail: { message_id: id, kind: m.kind, send_mode: "now" } });
  });
}

/** "Huỷ duyệt". A follow-up goes back to the drafts. The first message takes
    its lead back to page review with it — approving the pages and approving
    their message are one decision. */
export async function unapproveMessage(id: string, actor: Actor): Promise<void> {
  await tx(async (c) => {
    const m = await lockMessage(c, id);
    if (m.status !== "approved") throw new UpsellError(`Message ${id} is ${m.status}, not approved.`, 409);
    if (m.kind === "initial") {
      const lead = await lockLead(c, m.lead_id);
      await c.query("update upsell_messages set status = 'rejected', approved_by = null, approved_at = null where id = $1", [id]);
      if (lead.status === "approved") {
        await updateLead(c, lead.lead_id, { status: "pending_review", reviewed_by: null, reviewed_at: null });
        await recordStatus(c, lead.lead_id, "approved", "pending_review", actor, { reason: "unapproved" });
      }
    } else {
      await c.query("update upsell_messages set status = 'pending_review', approved_by = null, approved_at = null where id = $1", [id]);
    }
    await recordEvent(c, { lead_id: m.lead_id, type: "message_unapproved", actor, detail: { message_id: id, kind: m.kind } });
  });
}

export async function createCustomMessage(leadId: string, content: string, actor: Actor): Promise<string> {
  const text = content.trim();
  if (!text) throw new UpsellError("The message is empty.");
  const id = newMessageId();
  await tx(async (c) => {
    await lockLead(c, leadId);
    await c.query(
      "insert into upsell_messages (id, lead_id, kind, content, status, created_by) values ($1,$2,'custom',$3,'pending_review',$4)",
      [id, leadId, text.slice(0, 20_000), actor],
    );
    await recordEvent(c, { lead_id: leadId, type: "message_drafted", actor, detail: { message_id: id, kind: "custom" } });
  });
  return id;
}

export async function messagesForLead(leadId: string): Promise<MessageRow[]> {
  const p = await db();
  const { rows } = await p.query<MessageRow>("select * from upsell_messages where lead_id = $1 order by created_at", [leadId]);
  return rows;
}
