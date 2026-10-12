import "server-only";

import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { db, tx, type Db } from "./db";
import { designUrl, isoOrNull, recordEvent, recordStatus, type Actor } from "./common";
import { getSettings } from "./settings";
import {
  FORWARD,
  LEAD_STATUSES,
  PRE_SEND,
  UpsellError,
  type InstallRow,
  type LeadExport,
  type LeadRow,
  type LeadStatus,
} from "./types";

/* ==========================================================================
   Installs and leads: what the script pushes in, and what it reads back.
   ========================================================================== */

/* ---- column typing ------------------------------------------------------- */

type Kind = "text" | "num" | "int" | "bool" | "ts" | "textarr";

const INSTALL_COLS: Record<keyof InstallRow, Kind> = {
  store_domain: "text",
  installed_at: "ts",
  store_name: "text",
  email: "text",
  phone: "text",
  country: "text",
  timezone: "text",
  shopify_plan: "text",
  pf_plan: "text",
  app_status: "text",
  onboarding_intent: "text",
  storefront: "text",
  product_count: "text",
  category_hint: "text",
  email_type: "text",
  lead_score: "num",
  score_reasons: "text",
  lead: "bool",
  skip_reason: "text",
  rechecked: "bool",
  synced_at: "ts",
};

/** Fields `POST /leads` may set. Scoring and identity, refreshed on every run. */
const LEAD_PROFILE: Record<string, Kind> = {
  store_domain: "text",
  store_name: "text",
  email: "text",
  phone: "text",
  country: "text",
  timezone: "text",
  shopify_plan: "text",
  lead_score: "num",
  score_reasons: "text",
  category_hint: "text",
  onboarding_intent: "text",
  product_count: "text",
};

/** The baseline the script measures an upgrade against. Taken at lead time
    and replaced by the real values when the first message is sent. */
const LEAD_BASELINE: Record<string, Kind> = {
  plan_at_send: "text",
  price_at_send: "num",
  pages_at_send: "int",
  published_at_send: "int",
};

/** Fields `POST /leads/sync` may set — the outcome columns, nothing else. */
export const SYNC_FIELDS: Record<string, Kind> = {
  message_read: "bool",
  replied: "bool",
  last_reply_at: "ts",
  last_reply_text: "text",
  sentiment: "text",
  feedback_summary: "text",
  wants_changes: "bool",
  followup1_at: "ts",
  followup2_at: "ts",
  review_asked_at: "ts",
  reviewed_app: "bool",
  current_plan: "text",
  current_price: "num",
  pages_now: "int",
  published_now: "int",
  used_page: "bool",
  upgraded: "bool",
  upgraded_at: "ts",
  upgraded_to: "text",
  mrr_added: "num",
  app_status: "text",
  uninstalled_at: "ts",
};

function coerce(kind: Kind, v: unknown): unknown {
  if (v === undefined || v === null || v === "") return kind === "text" && v === "" ? "" : null;
  switch (kind) {
    case "text":
      return String(v);
    case "num": {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    case "int": {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    case "bool":
      return v === true || v === "true" || v === 1 || v === "1" || v === "Yes";
    case "ts":
      return isoOrNull(v);
    case "textarr":
      return Array.isArray(v) ? v.map(String) : null;
  }
}

function pick(src: Record<string, unknown>, cols: Record<string, Kind>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, kind] of Object.entries(cols)) if (k in src) out[k] = coerce(kind, src[k]);
  return out;
}

const q = (col: string) => `"${col}"`;

/** `update upsell_leads set a=$2, b=$3 … where lead_id=$1`, plus updated_at. */
export async function updateLead(c: Db, leadId: string, set: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(set);
  if (keys.length === 0) return;
  const assigns = keys.map((k, i) => `${q(k)} = $${i + 2}`).join(", ");
  await c.query(`update upsell_leads set ${assigns}, updated_at = now() where lead_id = $1`, [
    leadId,
    ...keys.map((k) => set[k]),
  ]);
}

export async function lockLead(c: PoolClient, leadId: string): Promise<LeadRow> {
  const { rows } = await c.query<LeadRow>("select * from upsell_leads where lead_id = $1 for update", [leadId]);
  if (!rows[0]) throw new UpsellError(`Lead ${leadId} not found.`, 404);
  return rows[0];
}

export async function getLead(leadId: string): Promise<LeadRow | null> {
  const p = await db();
  const { rows } = await p.query<LeadRow>("select * from upsell_leads where lead_id = $1", [leadId]);
  return rows[0] ?? null;
}

/* ---- installs ------------------------------------------------------------ */

export async function upsertInstalls(items: unknown[]): Promise<{ upserted: number; invalid: number }> {
  let upserted = 0;
  let invalid = 0;
  const p = await db();
  const cols = Object.keys(INSTALL_COLS);
  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      invalid++;
      continue;
    }
    const row = pick(raw as Record<string, unknown>, INSTALL_COLS);
    const domain = String(row.store_domain ?? "").trim().toLowerCase();
    if (!domain) {
      invalid++;
      continue;
    }
    row.store_domain = domain;
    row.lead = row.lead === true;
    row.rechecked = row.rechecked === true;
    /* Every column the row names is overwritten — the latest score is the
       truth. Columns it leaves out keep what they had. */
    const present = cols.filter((k) => k in row);
    await p.query(
      `insert into upsell_installs (${present.map(q).join(", ")})
       values (${present.map((_, i) => `$${i + 1}`).join(", ")})
       on conflict (store_domain) do update set
       ${present.filter((k) => k !== "store_domain").map((k) => `${q(k)} = excluded.${q(k)}`).join(", ")}`,
      present.map((k) => row[k]),
    );
    upserted++;
  }
  return { upserted, invalid };
}

export async function listInstalls(sinceHours: number): Promise<InstallRow[]> {
  const p = await db();
  const { rows } = await p.query<InstallRow>(
    `select * from upsell_installs
      where installed_at >= now() - make_interval(secs => $1)
         or (installed_at is null and synced_at >= now() - make_interval(secs => $1))
      order by installed_at desc nulls last`,
    [Math.max(0, sinceHours) * 3600],
  );
  return rows.map((r) => ({ ...r, lead_score: r.lead_score === null ? null : Number(r.lead_score) }));
}

/* ---- leads --------------------------------------------------------------- */

export type UpsertLeadsResult = {
  created: string[];
  updated: string[];
  skipped: { lead_id: string; reason: string }[];
};

export async function upsertLeads(items: unknown[], actor: Actor = "claude"): Promise<UpsertLeadsResult> {
  const cfg = await getSettings();
  const out: UpsertLeadsResult = { created: [], updated: [], skipped: [] };

  for (const raw of items) {
    const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const leadId = String(src.lead_id ?? "").trim();
    const domain = String(src.store_domain ?? "").trim().toLowerCase();
    if (!leadId || !domain) {
      out.skipped.push({ lead_id: leadId, reason: "lead_id and store_domain are required" });
      continue;
    }
    const group = src.group === "control" ? "control" : "test";
    const wanted: LeadStatus = src.status === "control" || src.status === "new" ? src.status : group === "control" ? "control" : "new";

    await tx(async (c) => {
      const { rows } = await c.query<LeadRow>("select * from upsell_leads where lead_id = $1 for update", [leadId]);
      const cur = rows[0];
      const profile = { ...pick(src, LEAD_PROFILE), store_domain: domain };

      if (cur) {
        const set: Record<string, unknown> = { ...profile };
        /* The baseline belongs to the lead until a send replaces it. */
        if (!cur.sent_at) Object.assign(set, pick(src, LEAD_BASELINE));
        /* Status and group move only while nothing has happened to the lead
           yet. Once it is building, in review, or further, a re-run of the
           scoring must not drag it back. */
        if (cur.status === "new" || cur.status === "control") {
          set.group = group;
          set.status = wanted;
        }
        await updateLead(c, leadId, set);
        if (set.status) await recordStatus(c, leadId, cur.status, wanted, actor);
        out.updated.push(leadId);
        return;
      }

      /* One lead per store. A second lead id for a domain we already hold —
         a reinstall, or the script's date-based id rolling over — would build
         and message the same merchant twice. */
      const clash = await c.query<{ lead_id: string }>("select lead_id from upsell_leads where store_domain = $1", [domain]);
      if (clash.rows[0]) {
        out.skipped.push({ lead_id: leadId, reason: `store already has lead ${clash.rows[0].lead_id}` });
        return;
      }

      const row: Record<string, unknown> = {
        lead_id: leadId,
        ...profile,
        ...pick(src, LEAD_BASELINE),
        group,
        status: wanted,
        pic: typeof src.pic === "string" && src.pic ? src.pic : cfg.pic,
        priority: src.priority === "high" ? "high" : "normal",
      };
      const keys = Object.keys(row);
      await c.query(
        `insert into upsell_leads (${keys.map(q).join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
        keys.map((k) => row[k]),
      );
      await recordEvent(c, { lead_id: leadId, type: "lead_created", actor, detail: { group, status: wanted, score: row.lead_score ?? null } });
      out.created.push(leadId);
    });
  }
  return out;
}

/* ---- the export select --------------------------------------------------- */

/* Written once: `leads/export`, the queue and every admin list read leads
   through it, so a view count can never mean one thing on the screen and
   another in the sheet. Customer events only — an admin opening the preview
   or the Builder fetching a file is not a merchant looking. */
export const LEAD_SELECT = `
select l.*,
       d.id as design_id, d.version as design_version, d.expires_at as design_expires_at,
       coalesce(ev.views, 0)          as views,
       coalesce(ev.unique_views, 0)   as unique_views,
       ev.first_view_at,
       coalesce(ev.downloads, 0)      as downloads,
       ev.first_download_at,
       coalesce(ev.cta_clicks, 0)     as cta_clicks,
       fb.rating,
       fc.comment                     as last_comment,
       coalesce(mk.kinds, '{}')       as message_kinds
  from upsell_leads l
  left join upsell_designs d on d.lead_id = l.lead_id
  left join lateral (
    select count(*) filter (where type = 'view')                         as views,
           count(distinct visitor_id) filter (where type = 'view')       as unique_views,
           min(created_at) filter (where type = 'view')                  as first_view_at,
           count(*) filter (where type = 'download')                     as downloads,
           min(created_at) filter (where type = 'download')              as first_download_at,
           count(*) filter (where type = 'cta_click')                    as cta_clicks
      from upsell_events e
     where e.design_id = d.id and e.actor = 'customer'
  ) ev on true
  left join lateral (
    select rating from upsell_events e
     where e.design_id = d.id and e.actor = 'customer' and e.type = 'feedback' and e.rating is not null
     order by created_at desc limit 1
  ) fb on true
  left join lateral (
    select comment from upsell_events e
     where e.design_id = d.id and e.actor = 'customer' and e.type = 'feedback' and coalesce(e.comment, '') <> ''
     order by created_at desc limit 1
  ) fc on true
  left join lateral (
    select array_agg(distinct kind) as kinds from upsell_messages m where m.lead_id = l.lead_id
  ) mk on true`;

export type LeadListRow = LeadExport & { design_version: number | null; design_expires_at: string | null };

export function shapeLead(r: Record<string, unknown>): LeadListRow {
  const out = r as unknown as LeadListRow;
  out.design_url = out.design_id ? designUrl(out.design_id) : null;
  out.lead_score = out.lead_score === null ? null : Number(out.lead_score);
  for (const k of ["price_at_send", "current_price", "mrr_added"] as const) {
    if (out[k] !== null && out[k] !== undefined) out[k] = Number(out[k]);
  }
  return out;
}

export async function exportLeads(opts: { all?: boolean; trackingDays?: number }): Promise<LeadExport[]> {
  const p = await db();
  if (opts.all) {
    const { rows } = await p.query(`${LEAD_SELECT} order by l.created_at desc`);
    return rows.map(shapeLead);
  }
  const days = opts.trackingDays ?? (await getSettings(p)).tracking_days;
  const { rows } = await p.query(
    `${LEAD_SELECT}
      where l.status = any($1::text[]) and l.created_at >= now() - make_interval(days => $2)
      order by l.created_at desc`,
    [["approved", "sent", "viewed", "downloaded", "used", "control"], Math.max(1, Math.round(days))],
  );
  return rows.map(shapeLead);
}

/* ---- sync ---------------------------------------------------------------- */

export type SyncResult = { updated: number; unknown: string[]; status_ignored: { lead_id: string; from: string; to: string }[] };

/** May the script move a lead from `cur` to `next`? Forward along
    sent → viewed → downloaded → used → upgraded, or to `uninstalled` — and
    never out of a status a person decided. */
export function syncMayMove(cur: LeadStatus, next: string): boolean {
  if (PRE_SEND.has(cur)) return false;
  if (next === "uninstalled") return cur !== "uninstalled";
  const a = FORWARD.indexOf(cur);
  const b = FORWARD.indexOf(next as LeadStatus);
  return a >= 0 && b > a;
}

export async function syncLeads(items: unknown[], actor: Actor = "claude"): Promise<SyncResult> {
  const out: SyncResult = { updated: 0, unknown: [], status_ignored: [] };
  for (const raw of items) {
    const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const leadId = String(src.lead_id ?? "");
    if (!leadId) continue;
    await tx(async (c) => {
      const { rows } = await c.query<LeadRow>("select * from upsell_leads where lead_id = $1 for update", [leadId]);
      const cur = rows[0];
      if (!cur) {
        out.unknown.push(leadId);
        return;
      }
      const set: Record<string, unknown> = { ...pick(src, SYNC_FIELDS), last_synced_at: new Date().toISOString() };

      /* Field changes that are news of their own. Keyed by type so a status
         move to the same name folds into it rather than writing twice. */
      const news = new Map<string, Record<string, unknown>>();
      if (set.upgraded === true && cur.upgraded !== true)
        news.set("upgraded", { to: set.upgraded_to ?? null, mrr_added: set.mrr_added ?? null });
      if (set.replied === true && (cur.replied !== true || (set.last_reply_at && set.last_reply_at !== cur.last_reply_at)))
        news.set("replied", { text: String(set.last_reply_text ?? "").slice(0, 300) });
      if ((set.uninstalled_at && !cur.uninstalled_at) || (set.app_status === "uninstalled" && cur.app_status !== "uninstalled"))
        news.set("uninstalled", { at: set.uninstalled_at ?? null });

      const next = typeof src.status === "string" ? src.status : null;
      if (next && next !== cur.status) {
        if (LEAD_STATUSES.includes(next as LeadStatus) && syncMayMove(cur.status, next)) {
          set.status = next;
          const ev = news.get(next);
          if (ev) Object.assign(ev, { from: cur.status, to: next });
          else news.set(next === "upgraded" || next === "uninstalled" ? next : "status_changed", { from: cur.status, to: next });
        } else {
          out.status_ignored.push({ lead_id: leadId, from: cur.status, to: next });
        }
      }

      await updateLead(c, leadId, set);
      for (const [type, detail] of news) await recordEvent(c, { lead_id: leadId, type, actor, detail });
      out.updated++;
    });
  }
  return out;
}

/* ---- the Builder's side -------------------------------------------------- */

export async function buildQueue(statuses: LeadStatus[], limit: number): Promise<LeadListRow[]> {
  const p = await db();
  const { rows } = await p.query(
    `${LEAD_SELECT}
      where l."group" = 'test' and l.status = any($1::text[])
      order by (l.priority = 'high') desc, l.lead_score desc nulls last, l.created_at asc
      limit $2`,
    [statuses, Math.max(1, Math.min(50, Math.round(limit)))],
  );
  return rows.map(shapeLead);
}

const BUILDER_MAY_SET: Record<string, readonly LeadStatus[]> = {
  building: ["new", "rebuild_requested", "building"],
  error: ["new", "building", "rebuild_requested"],
  skipped: ["new", "building", "rebuild_requested"],
};

export async function setBuildStatus(
  leadId: string,
  status: string,
  error: string | null,
  actor: Actor = "claude",
): Promise<LeadRow> {
  const from = BUILDER_MAY_SET[status];
  if (!from) throw new UpsellError("status must be building, error or skipped.", 422);
  return tx(async (c) => {
    const cur = await lockLead(c, leadId);
    if (!from.includes(cur.status))
      throw new UpsellError(`Lead ${leadId} is ${cur.status}; it cannot move to ${status}.`, 409);
    const set: Record<string, unknown> = { status };
    if (status === "building") {
      set.build_started_at = new Date().toISOString();
      set.error = null;
    } else {
      set.error = error ? error.slice(0, 2000) : null;
    }
    await updateLead(c, leadId, set);
    await recordStatus(c, leadId, cur.status, status, actor, error ? { error: error.slice(0, 300) } : {});
    return { ...cur, ...set } as LeadRow;
  });
}

/* ---- ids ----------------------------------------------------------------- */

/** The same id `niu_ops.py`'s `lead_id_for` makes: L + the date in Vietnam +
    four base-36 characters of the domain's SHA-1. Used when an admin turns a
    skipped install into a lead by hand, so the script recognises it. */
export function leadIdFor(domain: string, now = new Date()): { leadId: string; hash: bigint } {
  const h = BigInt(`0x${createHash("sha1").update(domain).digest("hex")}`);
  const digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let n = h % BigInt(36 ** 4);
  let b36 = "";
  for (let i = 0; i < 4; i++) {
    b36 = digits[Number(n % BigInt(36))] + b36;
    n /= BigInt(36);
  }
  const vn = new Date(now.getTime() + 7 * 3600 * 1000);
  const ymd = vn.toISOString().slice(2, 10).replace(/-/g, "");
  return { leadId: `L${ymd}${b36}`, hash: h };
}
