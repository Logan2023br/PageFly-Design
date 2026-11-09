import "server-only";

import { db as ssuDb } from "@/lib/storeSetUpsell/db";
import { SSU_KIND_LABEL } from "@/lib/storeSetUpsell/types";
import { db as ucp2Db } from "@/lib/ucp2/db";
import { UPGRADE_KINDS } from "@/lib/upsell/adminQueries";
import { db as upsellDb } from "@/lib/upsell/db";
import { db as urspDb } from "@/lib/ursp/db";
import { KIND_LABEL } from "@/lib/upsell/format";
import { addWeeks, type ReportData, type ReportUpsell } from "./defs";

/* ==========================================================================
   The numbers of one week of one upsell — see defs.ts for what the cohort
   (c_…) and activity (a_…) halves mean. Every query takes the week's Monday
   as $1 and nothing else from outside.
   ========================================================================== */

const VN = "Asia/Ho_Chi_Minh";
/** `col` falls in the week whose Monday is $1 (Vietnam time). */
const inW = (col: string) => `(${col} >= ($1::date::timestamp at time zone '${VN}') and ${col} < (($1::date + 7)::timestamp at time zone '${VN}'))`;

type Row = Record<string, string | number | null>;
const nums = (r: Row | undefined): Record<string, number> =>
  Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, Math.round(Number(v ?? 0) * 100) / 100]));

async function bpu(week: string): Promise<Omit<ReportData, "prev">> {
  const p = await upsellDb();
  const ev = (type: string) => `(select count(*) from upsell_events e where e.lead_id = l.lead_id and e.actor = 'customer' and e.type = '${type}')`;
  const sent = `l."group" = 'test' and ${inW("l.sent_at")}`;
  const [cohort, activity, events, messages] = await Promise.all([
    p.query<Row>(
      `select count(*) filter (where ${sent}) as c_sent,
              count(*) filter (where ${sent} and l.message_read is true) as c_read,
              count(*) filter (where ${sent} and ${ev("view")} > 0) as c_viewed,
              coalesce(sum(${ev("view")}) filter (where ${sent}), 0) as c_views,
              count(*) filter (where ${sent} and ${ev("download")} > 0) as c_downloaded,
              coalesce(sum(${ev("download")}) filter (where ${sent}), 0) as c_downloads,
              count(*) filter (where ${sent} and l.replied is true) as c_replied,
              count(*) filter (where ${sent} and l.reviewed_app is true) as c_reviewed,
              count(*) filter (where ${sent} and l.whatsapp_sent_at is not null) as c_whatsapp,
              count(*) filter (where ${sent} and l.upgraded is true) as c_upgraded,
              count(*) filter (where ${sent} and l.upgraded is true and ${UPGRADE_KINDS.normal.sql}) as c_up_normal,
              count(*) filter (where ${sent} and l.upgraded is true and ${UPGRADE_KINDS.organic.sql}) as c_up_organic,
              count(*) filter (where ${sent} and l.upgraded is true and ${UPGRADE_KINDS.claim.sql}) as c_up_claim,
              coalesce(sum(l.mrr_added) filter (where ${sent} and l.upgraded is true), 0) as c_mrr,
              count(*) filter (where ${sent} and l.uninstalled_at is not null) as c_uninstalled,
              count(*) filter (where l."group" = 'control' and ${inW("l.created_at")}) as k_control,
              count(*) filter (where l."group" = 'control' and ${inW("l.created_at")} and l.upgraded is true) as k_upgraded
         from upsell_leads l`,
      [week],
    ),
    p.query<Row>(
      `select count(*) filter (where l."group" = 'test' and ${inW("l.created_at")}) as a_leads,
              count(*) filter (where ${inW("l.built_at")}) as a_built,
              count(*) filter (where ${inW("l.last_reply_at")}) as a_replied,
              count(*) filter (where l."group" = 'test' and ${inW("l.upgraded_at")}) as a_upgraded,
              coalesce(sum(l.mrr_added) filter (where l."group" = 'test' and ${inW("l.upgraded_at")}), 0) as a_mrr,
              count(*) filter (where l."group" = 'test' and l.sent_at is not null and ${inW("l.uninstalled_at")}) as a_uninstalled
         from upsell_leads l`,
      [week],
    ),
    p.query<Row>(
      `select count(*) filter (where type = 'view') as a_views,
              count(distinct lead_id) filter (where type = 'view') as a_viewers,
              count(*) filter (where type = 'download') as a_downloads,
              count(distinct lead_id) filter (where type = 'download') as a_downloaders
         from upsell_events where actor = 'customer' and ${inW("created_at")}`,
      [week],
    ),
    p.query<{ kind: string; n: number }>(
      `select kind, count(*)::int as n from upsell_messages where status = 'sent' and ${inW("sent_at")} group by kind order by n desc`,
      [week],
    ),
  ]);
  const msgs = messages.rows.map((r) => ({ label: KIND_LABEL[r.kind] ?? r.kind, n: r.n }));
  return {
    metrics: { ...nums(cohort.rows[0]), ...nums(activity.rows[0]), ...nums(events.rows[0]), a_messages: msgs.reduce((s, m) => s + m.n, 0) },
    messages: msgs,
  };
}

async function ssu(week: string): Promise<Omit<ReportData, "prev">> {
  const p = await ssuDb();
  const sent = inW("c.sent_at");
  const gain = "greatest(coalesce(c.upgraded_price, 0) - coalesce(c.price_at_send, 0), 0)";
  const [cohort, activity, clicks, messages] = await Promise.all([
    p.query<Row>(
      `select count(*) filter (where ${sent}) as c_sent,
              count(*) filter (where ${sent} and c.delivered_at is not null) as c_delivered,
              count(*) filter (where ${sent} and c.read_at is not null) as c_read,
              count(*) filter (where ${sent} and c.replied) as c_replied,
              count(*) filter (where ${sent} and c.pages_updated_at is not null) as c_pages_updated,
              count(*) filter (where ${sent} and c.reviewed_at is not null) as c_reviewed,
              count(*) filter (where ${sent} and c.upgraded_at is not null) as c_upgraded,
              coalesce(sum(${gain}) filter (where ${sent} and c.upgraded_at is not null), 0) as c_mrr,
              count(*) filter (where ${sent} and c.uninstalled_at is not null) as c_uninstalled
         from ssu_customers c`,
      [week],
    ),
    p.query<Row>(
      `select count(*) filter (where ${inW("c.first_selected_at")}) as a_new_customers,
              count(*) filter (where ${inW("c.read_at")}) as a_read,
              count(*) filter (where ${inW("c.last_reply_at")}) as a_replied,
              count(*) filter (where ${inW("c.pages_updated_at")}) as a_pages_updated,
              count(*) filter (where ${inW("c.reviewed_at")}) as a_reviewed,
              count(*) filter (where ${inW("c.upgraded_at")}) as a_upgraded,
              coalesce(sum(${gain}) filter (where ${inW("c.upgraded_at")}), 0) as a_mrr,
              count(*) filter (where c.sent_at is not null and ${inW("c.uninstalled_at")}) as a_uninstalled
         from ssu_customers c`,
      [week],
    ),
    p.query<Row>(`select count(*) as a_clicks, count(distinct store_domain) as a_clicked_stores from ssu_selections where ${inW("event_time")}`, [week]),
    p.query<{ kind: string; n: number }>(
      `select kind, count(*)::int as n from ssu_messages where status = 'sent' and ${inW("sent_at")} group by kind order by n desc`,
      [week],
    ),
  ]);
  const msgs = messages.rows.map((r) => ({ label: SSU_KIND_LABEL[r.kind as keyof typeof SSU_KIND_LABEL] ?? r.kind, n: r.n }));
  return {
    metrics: { ...nums(cohort.rows[0]), ...nums(activity.rows[0]), ...nums(clicks.rows[0]), a_messages: msgs.reduce((s, m) => s + m.n, 0) },
    messages: msgs,
  };
}

async function ucp2(week: string): Promise<Omit<ReportData, "prev">> {
  const p = await ucp2Db();
  const sent = inW("r.sent_at");
  const [cohort, activity, byType] = await Promise.all([
    p.query<Row>(
      `select count(*) filter (where ${sent}) as c_sent,
              count(*) filter (where ${sent} and r.delivered_at is not null) as c_delivered,
              count(*) filter (where ${sent} and r.read_at is not null) as c_read,
              count(*) filter (where ${sent} and r.clicked_at is not null) as c_clicked,
              coalesce(sum(r.clicks) filter (where ${sent}), 0) as c_clicks,
              count(*) filter (where ${sent} and r.downloaded_at is not null) as c_downloaded,
              count(*) filter (where ${sent} and r.replied_at is not null) as c_replied,
              coalesce(sum(r.replies) filter (where ${sent}), 0) as c_replies,
              count(*) filter (where ${sent} and r.reviewed_at is not null) as c_reviewed,
              count(*) filter (where ${sent} and r.upgraded_at is not null) as c_upgraded,
              coalesce(sum(r.upgraded_price) filter (where ${sent} and r.upgraded_at is not null), 0) as c_mrr,
              count(*) filter (where ${sent} and r.uninstalled_at is not null) as c_uninstalled
         from ucp2_rows r`,
      [week],
    ),
    p.query<Row>(
      `select count(*) filter (where ${inW("r.read_at")}) as a_read,
              count(*) filter (where ${inW("r.clicked_at")}) as a_clicked,
              count(*) filter (where ${inW("r.downloaded_at")}) as a_downloaded,
              count(*) filter (where ${inW("r.replied_at")}) as a_replied,
              count(*) filter (where ${inW("r.reviewed_at")}) as a_reviewed,
              count(*) filter (where ${inW("r.upgraded_at")}) as a_upgraded,
              coalesce(sum(r.upgraded_price) filter (where ${inW("r.upgraded_at")}), 0) as a_mrr,
              count(*) filter (where ${inW("r.uninstalled_at")}) as a_uninstalled
         from ucp2_rows r`,
      [week],
    ),
    p.query<{ type: string; sent: number; read: number; replied: number; upgraded: number; reviewed: number }>(
      `select coalesce(r.type_user, '(trống)') as type, count(*)::int as sent,
              count(*) filter (where r.read_at is not null)::int as read,
              count(*) filter (where r.replied_at is not null)::int as replied,
              count(*) filter (where r.upgraded_at is not null)::int as upgraded,
              count(*) filter (where r.reviewed_at is not null)::int as reviewed
         from ucp2_rows r where ${sent} group by 1 order by sent desc`,
      [week],
    ),
  ]);
  const m = { ...nums(cohort.rows[0]), ...nums(activity.rows[0]) };
  /* Each row is one invite: the messages of the week are its sends. */
  return { metrics: m, messages: m.c_sent ? [{ label: "Tin mời Collection Pages", n: m.c_sent }] : [], byType: byType.rows };
}

async function ursp(week: string): Promise<Omit<ReportData, "prev">> {
  const p = await urspDb();
  const sent = inW("t.sent_at");
  const [cohort, activity, messages, byType] = await Promise.all([
    p.query<Row>(
      `select count(*) filter (where ${sent}) as c_sent,
              count(*) filter (where ${sent} and t.segment = 'recap') as c_sent_recap,
              count(*) filter (where ${sent} and t.segment = 'active') as c_sent_active,
              count(*) filter (where ${sent} and coalesce(t.variant, 'A') = 'A') as c_sent_a,
              count(*) filter (where ${sent} and t.variant = 'B') as c_sent_b,
              count(*) filter (where ${sent} and t.read_at is not null) as c_read,
              count(*) filter (where ${sent} and t.followup_sent_at is not null) as c_followup,
              count(*) filter (where ${sent} and t.replied_at is not null) as c_replied,
              count(*) filter (where ${sent} and t.reply_intent = 'agree') as c_agree,
              count(*) filter (where ${sent} and t.reply_intent = 'decline') as c_decline,
              count(*) filter (where ${sent} and t.done_at is not null) as c_done,
              count(*) filter (where ${sent} and t.upgraded_at is not null) as c_upgraded,
              coalesce(sum(t.upgraded_price) filter (where ${sent} and t.upgraded_at is not null), 0) as c_mrr,
              count(*) filter (where ${sent} and t.reviewed_at is not null) as c_reviewed,
              count(*) filter (where ${sent} and t.mood = 'happy') as c_happy,
              count(*) filter (where ${sent} and t.uninstalled_at is not null) as c_uninstalled
         from ursp_targets t`,
      [week],
    ),
    p.query<Row>(
      `select count(*) filter (where ${inW("t.created_at")}) as a_found,
              count(*) filter (where ${inW("t.created_at")} and t.status = 'skipped') as a_skipped,
              count(*) filter (where ${inW("t.read_at")}) as a_read,
              count(*) filter (where ${inW("t.replied_at")}) as a_replied,
              count(*) filter (where ${inW("t.done_at")}) as a_done,
              count(*) filter (where ${inW("t.upgraded_at")}) as a_upgraded,
              coalesce(sum(t.upgraded_price) filter (where ${inW("t.upgraded_at")}), 0) as a_mrr,
              count(*) filter (where ${inW("t.reviewed_at")}) as a_reviewed,
              count(*) filter (where t.sent_at is not null and ${inW("t.uninstalled_at")}) as a_uninstalled
         from ursp_targets t`,
      [week],
    ),
    p.query<{ label: string; n: number }>(
      `select k.label, k.n from (
         select 'Tin mời bản A' as label, count(*) filter (where ${sent} and coalesce(t.variant, 'A') = 'A')::int as n, 1 as o from ursp_targets t
         union all select 'Tin mời bản B', count(*) filter (where ${sent} and t.variant = 'B')::int, 2 from ursp_targets t
         union all select 'Tin nhắc lại', count(*) filter (where ${inW("t.followup_sent_at")})::int, 3 from ursp_targets t
       ) k where k.n > 0 order by k.o`,
      [week],
    ),
    p.query<{ type: string; sent: number; read: number; replied: number; upgraded: number; reviewed: number }>(
      `select initcap(t.segment) || ' · bản ' || coalesce(t.variant, 'A') as type, count(*)::int as sent,
              count(*) filter (where t.read_at is not null)::int as read,
              count(*) filter (where t.replied_at is not null)::int as replied,
              count(*) filter (where t.upgraded_at is not null)::int as upgraded,
              count(*) filter (where t.reviewed_at is not null)::int as reviewed
         from ursp_targets t where ${sent} group by 1 order by 1`,
      [week],
    ),
  ]);
  const msgs = messages.rows;
  return {
    metrics: { ...nums(cohort.rows[0]), ...nums(activity.rows[0]), a_messages: msgs.reduce((s, m) => s + m.n, 0) },
    messages: msgs,
    byType: byType.rows,
  };
}

const COMPUTE: Record<ReportUpsell, (week: string) => Promise<Omit<ReportData, "prev">>> = { bpu, ssu, ucp2, ursp };

/** The week, and the one before it for the arrows — both as of now. */
export async function computeReport(upsell: ReportUpsell, week: string): Promise<ReportData> {
  const [cur, prev] = await Promise.all([COMPUTE[upsell](week), COMPUTE[upsell](addWeeks(week, -1))]);
  return { ...cur, prev: prev.metrics };
}

/** The first week anything was sent — where the history starts. */
export async function firstSentAt(upsell: ReportUpsell): Promise<Date | null> {
  const q = {
    bpu: async () => (await upsellDb()).query<{ at: Date | null }>(`select min(sent_at) as at from upsell_leads where "group" = 'test'`),
    ssu: async () => (await ssuDb()).query<{ at: Date | null }>("select min(sent_at) as at from ssu_customers"),
    ucp2: async () => (await ucp2Db()).query<{ at: Date | null }>("select min(sent_at) as at from ucp2_rows"),
    ursp: async () => (await urspDb()).query<{ at: Date | null }>("select min(sent_at) as at from ursp_targets"),
  }[upsell];
  const at = (await q()).rows[0]?.at;
  return at ? new Date(at) : null;
}
