import "server-only";

import {
  DEFAULT_EDIT_OFFER_TEMPLATE,
  DEFAULT_VIEW_REMINDER_TEMPLATE,
  EDIT_OFFER_DAYS,
  designUrl,
  fillTemplate,
  longDate,
  newMessageId,
  recordEvent,
  ttlDays,
} from "./common";
import { db, tx } from "./db";
import { notifySlack } from "./notify";
import { getSettings, type Settings } from "./settings";
import type { AutoKind, AutoMode, LeadRow } from "./types";

/* ==========================================================================
   The two messages PageFly Design writes on its own, from what the customer
   did with the pages we sent:

     view_reminder  viewed, not downloaded `view_reminder_hours` after the
                    first view: the link is part of a limited program and
                    expires on a date — download now.
     edit_offer     downloaded: Complimentary Editing for 15 days from the
                    date the pages were sent — reply to ask for changes.

   EACH HAS A MODE, chosen by an admin on the "Tin tự động" tab:
     manual  the message is written and waits on Tin chờ duyệt — nothing
             reaches the customer until an admin sends it (the usual rule);
     auto    the admin has decided in advance: it is written approved, and
             BPU Ops sends it on its next run, in the customer's hours;
     off     nothing is written.

   ONE OF EACH PER LEAD, ever — the (lead, kind) unique index holds it even
   if two ticks overlap. Only test-group leads with a Crisp conversation
   (both go into the conversation the first message opened), still
   installed, and only while the message is still true: a link that has
   expired is not worth a reminder, and an offer whose 15 days have passed
   is not an offer.

   Run from the maintenance tick (every 5 minutes on the VPS).
   ========================================================================== */

const BATCH = 50;

export type AutoResult = Record<AutoKind, string[]>;

type Candidate = LeadRow & { design_id: string; expires_at: string | null };

function modeOf(cfg: Settings, kind: AutoKind): AutoMode {
  const v = kind === "view_reminder" ? cfg.view_reminder_mode : cfg.edit_offer_mode;
  return v === "auto" || v === "off" ? v : "manual";
}

/** The message as the template (Settings', or the default) makes it for a lead. */
export function autoMessageFor(kind: AutoKind, lead: Candidate, cfg: Settings): string {
  const tpl =
    kind === "view_reminder"
      ? cfg.view_reminder_template.trim() || DEFAULT_VIEW_REMINDER_TEMPLATE
      : cfg.edit_offer_template.trim() || DEFAULT_EDIT_OFFER_TEMPLATE;
  const sent = lead.sent_at ? new Date(lead.sent_at) : null;
  const editUntil = sent ? new Date(sent.getTime() + EDIT_OFFER_DAYS * 86_400_000).toISOString() : null;
  return fillTemplate(tpl, {
    store_name: lead.store_name?.trim() || lead.store_domain.replace(/\.myshopify\.com$/, ""),
    link: designUrl(lead.design_id),
    pic: lead.pic || cfg.pic,
    ttl_days: String(ttlDays()),
    expires_on: longDate(lead.expires_at),
    edit_until: longDate(editUntil),
  });
}

/** The message for an example store, for the admin screen's preview. */
export function autoMessageSample(kind: AutoKind, cfg: Settings): string {
  const now = new Date();
  return autoMessageFor(
    kind,
    {
      store_name: "Your Store",
      store_domain: "your-store.myshopify.com",
      design_id: "EXAMPLE1",
      pic: null,
      sent_at: now.toISOString(),
      expires_at: new Date(now.getTime() + ttlDays() * 86_400_000).toISOString(),
    } as Candidate,
    cfg,
  );
}

const BASE = `
  select l.*, d.id as design_id, d.expires_at
    from upsell_leads l
    join upsell_designs d on d.lead_id = l.lead_id
    join lateral (
      select min(created_at) filter (where type = 'view') as first_view,
             count(*) filter (where type = 'download')    as downloads
        from upsell_events e
       where e.design_id = d.id and e.actor = 'customer'
    ) ev on true
   where l."group" = 'test'
     and l.crisp_session is not null
     and l.status <> 'uninstalled'
     and coalesce(l.app_status, '') <> 'uninstalled'
     and not exists (select 1 from upsell_messages m where m.lead_id = l.lead_id and m.kind = $1)`;

async function candidates(kind: AutoKind, cfg: Settings): Promise<Candidate[]> {
  const p = await db();
  if (kind === "view_reminder") {
    const { rows } = await p.query<Candidate>(
      `${BASE}
         and ev.first_view is not null and ev.downloads = 0
         and ev.first_view < now() - make_interval(hours => $2)
         and (d.expires_at is null or d.expires_at > now())
       order by ev.first_view limit ${BATCH}`,
      [kind, Math.max(0, Math.round(cfg.view_reminder_hours))],
    );
    return rows;
  }
  const { rows } = await p.query<Candidate>(
    `${BASE}
       and ev.downloads > 0
       and l.sent_at is not null and l.sent_at > now() - make_interval(days => $2)
     order by l.sent_at limit ${BATCH}`,
    [kind, EDIT_OFFER_DAYS],
  );
  return rows;
}

/** Writes what is due; returns the lead ids it wrote for, per kind. */
export async function runAutoMessages(): Promise<AutoResult> {
  const out: AutoResult = { view_reminder: [], edit_offer: [] };
  const cfg = await getSettings();
  let drafted = false;
  for (const kind of ["view_reminder", "edit_offer"] as const) {
    const mode = modeOf(cfg, kind);
    if (mode === "off") continue;
    for (const lead of await candidates(kind, cfg)) {
      const made = await tx(async (c) => {
        const id = newMessageId();
        const content = autoMessageFor(kind, lead, cfg);
        const auto = mode === "auto";
        const ins = await c.query(
          `insert into upsell_messages (id, lead_id, kind, content, status, send_mode, created_by, approved_by, approved_at)
           values ($1, $2, $3, $4, $5, 'window', 'system', $6, case when $7 then now() end)
           on conflict (lead_id, kind) where kind <> 'custom' do nothing
           returning id`,
          [id, lead.lead_id, kind, content, auto ? "approved" : "pending_review", auto ? "auto" : null, auto],
        );
        if (!ins.rows[0]) return false;
        await recordEvent(c, { lead_id: lead.lead_id, type: "message_drafted", actor: "system", detail: { message_id: id, kind, auto } });
        if (auto)
          await recordEvent(c, { lead_id: lead.lead_id, type: "message_approved", actor: "auto", detail: { message_id: id, kind, send_mode: "window" } });
        return true;
      });
      if (made) {
        out[kind].push(lead.lead_id);
        if (mode === "manual") drafted = true;
      }
    }
  }
  if (drafted) void notifySlack("message").catch(() => undefined);
  return out;
}
