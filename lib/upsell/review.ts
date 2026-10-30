import "server-only";

import { kickSoon } from "./routines";
import { db, tx } from "./db";
import { DEFAULT_INITIAL_TEMPLATE, designUrl, fillTemplate, newMessageId, recordEvent, recordStatus, sampleTemplate, type Actor } from "./common";
import { leadIdFor, lockLead, updateLead } from "./leads";
import { getSettings, type Settings } from "./settings";
import { PAGE_LABELS, PAGE_TYPES, UpsellError, type InstallRow, type LeadRow, type MessageRow, type PageType, type SendMode } from "./types";

/* ==========================================================================
   What only an admin can do to a lead: approve, ask for a rebuild, reject,
   put it back in the queue, add one by hand.
   ========================================================================== */

const label = (t: string | null) => PAGE_LABELS[t as PageType] ?? (t ? `${t} page` : "page");

/** The first message as the template makes it for this lead. `sample`: the
    pages carry example products (the storefront was password-protected). */
export function initialDraft(lead: LeadRow, designId: string | null, cfg: Settings, sample = false): string {
  const base = cfg.initial_message_template.trim() || DEFAULT_INITIAL_TEMPLATE;
  const tpl = sample ? sampleTemplate(base) : base;
  return fillTemplate(tpl, {
    store_name: lead.store_name?.trim() || lead.store_domain.replace(/\.myshopify\.com$/, ""),
    page1_label: label(lead.page1_type),
    page2_label: label(lead.page2_type),
    link: designId ? designUrl(designId) : "",
    pic: lead.pic || cfg.pic,
  });
}

export async function approveLead(
  leadId: string,
  opts: { content?: string | null; send_mode?: SendMode; note?: string | null; autoSend?: boolean },
  actor: Actor,
): Promise<{ message_id: string }> {
  const cfg = await getSettings();
  const out = await tx(async (c) => {
    const lead = await lockLead(c, leadId);
    if (lead.status !== "pending_review")
      throw new UpsellError(`Lead ${leadId} is ${lead.status}; only a lead waiting for review can be approved.`, 409);
    const d = await c.query<{ id: string; sample: boolean }>("select id, sample from upsell_designs where lead_id = $1", [leadId]);
    if (!d.rows[0]) throw new UpsellError(`Lead ${leadId} has no pages to approve.`, 409);

    const content = opts.content?.trim() || initialDraft(lead, d.rows[0].id, cfg, d.rows[0].sample);
    const mode: SendMode = opts.send_mode === "now" ? "now" : "window";
    /* "Tin nhắn build page" on the Tin nhắn tab: Tự động gửi — approving the
       pages approves their message too; Đợi duyệt — the message waits there
       for its own press. A page approved by "Tự duyệt" sends its message
       too: nobody is there to press anything. */
    const autoSend = opts.autoSend ?? cfg.build_message_mode === "auto";
    const status = autoSend ? "approved" : "pending_review";

    /* An initial message may exist already, from an approval that was taken
       back. It is reused — one initial per lead — unless it went out. */
    const prev = await c.query<MessageRow>("select * from upsell_messages where lead_id = $1 and kind = 'initial' for update", [leadId]);
    let messageId: string;
    if (prev.rows[0]) {
      if (prev.rows[0].status === "sent") throw new UpsellError(`Lead ${leadId} already received its first message.`, 409);
      messageId = prev.rows[0].id;
      await c.query(
        `update upsell_messages set content=$2, status=$5, send_mode=$3,
                approved_by=case when $5 = 'approved' then $4 end, approved_at=case when $5 = 'approved' then now() end, error=null
          where id=$1`,
        [messageId, content, mode, actor, status],
      );
    } else {
      messageId = newMessageId();
      await c.query(
        `insert into upsell_messages (id, lead_id, kind, content, status, send_mode, created_by, approved_by, approved_at)
         values ($1,$2,'initial',$3,$6,$4,$5,case when $6 = 'approved' then $5 end,case when $6 = 'approved' then now() end)`,
        [messageId, leadId, content, mode, actor, status],
      );
    }

    await updateLead(c, leadId, {
      status: "approved",
      reviewed_by: actor,
      reviewed_at: new Date().toISOString(),
      review_note: opts.note?.trim() || null,
    });
    await recordStatus(c, leadId, lead.status, "approved", actor, { rebuilds: lead.rebuild_count });
    await recordEvent(c, {
      lead_id: leadId,
      type: autoSend ? "message_approved" : "message_drafted",
      actor,
      detail: { message_id: messageId, kind: "initial", send_mode: mode },
    });
    return { message_id: messageId };
  });
  kickSoon("duyệt page");
  return out;
}

export async function requestRebuild(
  leadId: string,
  opts: { note: string; page_types?: string[] | null },
  actor: Actor,
): Promise<void> {
  const note = opts.note?.trim();
  if (!note) throw new UpsellError("Ghi chú rebuild là bắt buộc.");
  const types = (opts.page_types ?? []).filter((t) => (PAGE_TYPES as readonly string[]).includes(t)).slice(0, 2);
  await tx(async (c) => {
    const lead = await lockLead(c, leadId);
    if (lead.status !== "pending_review")
      throw new UpsellError(`Lead ${leadId} is ${lead.status}; only a lead waiting for review can be sent back.`, 409);
    await updateLead(c, leadId, {
      status: "rebuild_requested",
      rebuild_note: note.slice(0, 4000),
      rebuild_page_types: types.length ? types : null,
      rebuild_count: lead.rebuild_count + 1,
      reviewed_by: actor,
      reviewed_at: new Date().toISOString(),
    });
    await recordStatus(c, leadId, lead.status, "rebuild_requested", actor, { note: note.slice(0, 500), page_types: types });
  });
  kickSoon("yêu cầu build lại");
}

export async function rejectLead(leadId: string, reason: string, actor: Actor): Promise<void> {
  const why = reason?.trim();
  if (!why) throw new UpsellError("Lý do từ chối là bắt buộc.");
  await tx(async (c) => {
    const lead = await lockLead(c, leadId);
    if (lead.status !== "pending_review")
      throw new UpsellError(`Lead ${leadId} is ${lead.status}; only a lead waiting for review can be rejected.`, 409);
    await updateLead(c, leadId, {
      status: "rejected",
      reject_reason: why.slice(0, 2000),
      reviewed_by: actor,
      reviewed_at: new Date().toISOString(),
    });
    await recordStatus(c, leadId, lead.status, "rejected", actor, { reason: why.slice(0, 500) });
  });
}

const REQUEUE_FROM = new Set(["rejected", "error", "skipped", "uninstalled"]);

/** "Đưa về hàng đợi build". A lead that already has pages comes back as a
    rebuild, so the Builder knows to make a new version rather than start
    over. */
export async function requeueLead(leadId: string, actor: Actor): Promise<void> {
  await tx(async (c) => {
    const lead = await lockLead(c, leadId);
    if (!REQUEUE_FROM.has(lead.status))
      throw new UpsellError(`Lead ${leadId} is ${lead.status}; only rejected, failed, skipped or uninstalled leads go back to the queue.`, 409);
    const d = await c.query("select 1 from upsell_designs where lead_id = $1", [leadId]);
    const to = d.rows[0] ? "rebuild_requested" : "new";
    await updateLead(c, leadId, {
      status: to,
      group: "test",
      error: null,
      build_timeouts: 0,
      ...(to === "rebuild_requested" && !lead.rebuild_note ? { rebuild_note: "Admin đưa lại vào hàng đợi build." } : {}),
    });
    await recordStatus(c, leadId, lead.status, to, actor, { reason: "requeued" });
  });
  kickSoon("đưa lại vào hàng đợi build");
}

/** "Thêm thành lead" on an install the script skipped. */
export async function installToLead(domain: string, actor: Actor): Promise<string> {
  const cfg = await getSettings();
  const leadId = await tx(async (c) => {
    const { rows } = await c.query<InstallRow>("select * from upsell_installs where store_domain = $1 for update", [domain]);
    const st = rows[0];
    if (!st) throw new UpsellError(`No install for ${domain}.`, 404);
    const clash = await c.query<{ lead_id: string }>("select lead_id from upsell_leads where store_domain = $1", [domain]);
    if (clash.rows[0]) throw new UpsellError(`${domain} already is lead ${clash.rows[0].lead_id}.`, 409);
    const { leadId } = leadIdFor(domain);
    await c.query(
      `insert into upsell_leads (lead_id, store_domain, store_name, email, phone, country, timezone, shopify_plan,
         lead_score, score_reasons, category_hint, onboarding_intent, product_count, "group", status, pic, priority, plan_at_send)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'test','new',$14,'high',$15)`,
      [
        leadId, domain, st.store_name, st.email, st.phone, st.country, st.timezone, st.shopify_plan,
        st.lead_score, st.score_reasons, st.category_hint, st.onboarding_intent, st.product_count, cfg.pic, st.pf_plan || "Free",
      ],
    );
    await c.query("update upsell_installs set lead = true where store_domain = $1", [domain]);
    await recordEvent(c, { lead_id: leadId, type: "lead_created", actor, detail: { manual: true, skip_reason: st.skip_reason } });
    return leadId;
  });
  kickSoon("admin thêm lead");
  return leadId;
}

export async function setLeadMeta(
  leadId: string,
  patch: { pic?: string | null; priority?: "normal" | "high"; internal_notes?: string | null; note?: string | null },
  actor: Actor,
): Promise<void> {
  await tx(async (c) => {
    const lead = await lockLead(c, leadId);
    const set: Record<string, unknown> = {};
    if (patch.pic !== undefined) set.pic = patch.pic?.trim() || null;
    if (patch.priority === "normal" || patch.priority === "high") set.priority = patch.priority;
    if (patch.internal_notes !== undefined) set.internal_notes = patch.internal_notes?.slice(0, 10_000) ?? null;
    /* A note appended to the timeline and kept on the lead. */
    const note = patch.note?.trim();
    if (note) {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      set.internal_notes = [lead.internal_notes, `[${stamp} ${actor.replace(/^admin:/, "")}] ${note}`].filter(Boolean).join("\n").slice(-10_000);
    }
    await updateLead(c, leadId, set);
    if (note) await recordEvent(c, { lead_id: leadId, type: "note_added", actor, comment: note.slice(0, 2000) });
    if (set.pic !== undefined && set.pic !== lead.pic)
      await recordEvent(c, { lead_id: leadId, type: "note_added", actor, detail: { pic: { from: lead.pic, to: set.pic } } });
  });
}

export type WhatsappState = "sent" | "skipped" | "none";

export function whatsappStateOf(lead: Pick<LeadRow, "whatsapp_sent_at" | "whatsapp_skipped_at">): WhatsappState {
  return lead.whatsapp_sent_at ? "sent" : lead.whatsapp_skipped_at ? "skipped" : "none";
}

/** The WhatsApp mark on a lead, set by an admin: "sent" (also messaged on
    WhatsApp), "skipped" (not a customer to message there), or "none" (not
    decided — the two buttons again). The two marks exclude each other.
    Nothing is sent from here — WhatsApp happens on someone's phone — so
    this only records who said so, and when. */
export async function setWhatsappState(leadId: string, state: WhatsappState, actor: Actor): Promise<void> {
  await tx(async (c) => {
    const lead = await lockLead(c, leadId);
    if (whatsappStateOf(lead) === state) return;
    const now = new Date().toISOString();
    await updateLead(c, leadId, {
      whatsapp_sent_at: state === "sent" ? now : null,
      whatsapp_sent_by: state === "sent" ? actor : null,
      whatsapp_skipped_at: state === "skipped" ? now : null,
      whatsapp_skipped_by: state === "skipped" ? actor : null,
    });
    const type = state === "sent" ? "whatsapp_sent" : state === "skipped" ? "whatsapp_skipped" : "whatsapp_unmarked";
    await recordEvent(c, { lead_id: leadId, type, actor });
  });
}

export type SubmitState = "submitted" | "not_submitted" | "none";

/** Đã submit / Chưa submit on an upgraded lead; "none" takes the mark back. */
export async function setSubmitState(leadId: string, state: SubmitState, actor: Actor): Promise<void> {
  await tx(async (c) => {
    const lead = await lockLead(c, leadId);
    if ((lead.submit_state ?? "none") === state) return;
    const on = state !== "none";
    await updateLead(c, leadId, {
      submit_state: on ? state : null,
      submit_at: on ? new Date().toISOString() : null,
      submit_by: on ? actor : null,
    });
    await recordEvent(c, { lead_id: leadId, type: on ? `upsell_${state}` : "upsell_submit_unmarked", actor });
  });
}

/** "Đã kiểm tra" on the customer's latest reply, or taken back. */
export async function setReplyChecked(leadId: string, checked: boolean, actor: Actor): Promise<void> {
  await tx(async (c) => {
    await lockLead(c, leadId);
    await updateLead(c, leadId, {
      reply_checked_at: checked ? new Date().toISOString() : null,
      reply_checked_by: checked ? actor : null,
    });
    await recordEvent(c, { lead_id: leadId, type: checked ? "reply_checked" : "reply_unchecked", actor });
  });
}

/** The earlier on/off form, kept for callers that still send { sent }. */
export async function setWhatsappSent(leadId: string, sent: boolean, actor: Actor): Promise<void> {
  await setWhatsappState(leadId, sent ? "sent" : "none", actor);
}

/** Counts for the sidebar and the tab bar. */
export async function pendingCounts(): Promise<{ pages: number; messages: number; failed: number }> {
  const p = await db();
  const { rows } = await p.query<{ pages: number; messages: number; failed: number }>(
    `select (select count(*) from upsell_leads where status = 'pending_review') as pages,
            (select count(*) from upsell_messages where status = 'pending_review') as messages,
            (select count(*) from upsell_messages where status = 'failed') as failed`,
  );
  return rows[0] ?? { pages: 0, messages: 0, failed: 0 };
}
