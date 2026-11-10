import "server-only";

import { db } from "./db";
import type { Segment, UrspNote, UrspTarget } from "./types";

/* ==========================================================================
   What the Upsell Responsive screen reads: each segment's funnel (found →
   left out, and why → sent → read → replied → agreed → handled → upgraded /
   reviewed, and how satisfied), the days, and the rows of each tab.
   ========================================================================== */

export const PAGE_SIZE = 30;

export const URSP_TABS = [
  { id: "overview", label: "Tổng quan" },
  { id: "queue", label: "Chờ gửi" },
  { id: "sent", label: "Đã gửi" },
  { id: "replied", label: "Khách phản hồi" },
  { id: "working", label: "Đang xử lý" },
  { id: "done", label: "Đã xử lý" },
  { id: "dismissed", label: "Đã bỏ qua" },
  { id: "cancelled", label: "Đã huỷ" },
  { id: "skipped", label: "Bị loại" },
  { id: "ab", label: "A/B test" },
  { id: "settings", label: "Cài đặt" },
] as const;
export type UrspTab = (typeof URSP_TABS)[number]["id"];

const TAB_SQL: Record<Exclude<UrspTab, "overview" | "settings">, string> = {
  queue: "(t.status in ('pending', 'approved', 'sending', 'failed') or t.followup_status in ('pending', 'approved', 'sending', 'failed'))",
  sent: "t.status = 'sent'",
  /* the inbox: replies no one has taken up or let go yet */
  replied: "t.status = 'sent' and t.replied_at is not null and t.working_at is null and t.done_at is null and t.dismissed_at is null and t.cancelled_at is null",
  working: "t.status = 'sent' and t.working_at is not null and t.done_at is null and t.dismissed_at is null",
  done: "t.status = 'sent' and t.done_at is not null",
  dismissed: "t.status = 'sent' and t.dismissed_at is not null",
  /* taken up, then called off */
  cancelled: "t.status = 'sent' and t.cancelled_at is not null and t.working_at is null and t.done_at is null and t.dismissed_at is null",
  skipped: "t.status = 'skipped'",
  /* the A/B tab lists the stores held for B */
  ab: "t.status = 'held'",
};

export type UrspFilters = {
  q?: string;
  seg?: string;
  from?: string;
  to?: string;
  reason?: string;
  intent?: string;
  mood?: string;
  open?: string;
  /** whether they saw it, and where the reminder stands — a key of SEEN */
  seen?: string;
  /** the A/B test's half: A or B */
  variant?: string;
  /** what came of it — a key of OUTCOME */
  outcome?: string;
  /** the queue's parts: pending (Chờ duyệt), waiting (Chờ gửi), failed */
  status?: "pending" | "waiting" | "failed";
  page?: number;
};

/** "Trạng thái xem" — fixed SQL per key; an unknown key filters nothing. */
export const SEEN = {
  seen: { label: "Đã xem", sql: "t.read_at is not null" },
  unseen: { label: "Chưa xem", sql: "t.read_at is null" },
  delivered: { label: "Đã tới, chưa xem", sql: "t.read_at is null and t.delivered_at is not null" },
  seen_no_reply: { label: "Đã xem, chưa reply", sql: "t.read_at is not null and t.replied_at is null" },
  followup_waiting: { label: "Chờ nhắc lại", sql: "t.read_at is not null and t.replied_at is null and t.done_at is null and t.working_at is null and t.dismissed_at is null and t.cancelled_at is null and t.followup_status is null" },
  followup_sent: { label: "Đã nhắc lại", sql: "t.followup_sent_at is not null" },
  followup_no_reply: { label: "Đã nhắc lại, vẫn chưa reply", sql: "t.followup_sent_at is not null and t.replied_at is null" },
  offer_live: { label: "Ưu đãi còn hạn", sql: "t.offer_until > now()" },
  offer_expired: { label: "Ưu đãi đã hết hạn", sql: "t.offer_until <= now()" },
} as const;

/** "Kết quả" — fixed SQL per key; an unknown key filters nothing. */
export const OUTCOME = {
  upgraded: { label: "Đã nâng cấp", sql: "t.upgraded_at is not null" },
  upgraded_after_done: { label: "Nâng cấp sau khi xử lý", sql: "t.upgraded_at is not null and t.done_at is not null and t.upgraded_at >= t.done_at" },
  reviewed: { label: "Đã review app 5★", sql: "t.reviewed_at is not null" },
  reviewed_after_done: { label: "Review sau khi xử lý", sql: "t.reviewed_at is not null and t.done_at is not null and t.reviewed_at >= t.done_at" },
  reviewed_before: { label: "Đã 5★ từ trước khi gửi", sql: "t.first_review >= 5" },
  not_upgraded: { label: "Chưa nâng cấp", sql: "t.upgraded_at is null" },
  not_reviewed: { label: "Chưa review", sql: "t.reviewed_at is null and coalesce(t.first_review, 0) < 5" },
  done: { label: "Đã xử lý xong", sql: "t.done_at is not null" },
  not_done: { label: "Chưa xử lý", sql: "t.done_at is null and t.dismissed_at is null and t.working_at is null and t.cancelled_at is null" },
  working: { label: "Đang xử lý", sql: "t.working_at is not null and t.done_at is null and t.dismissed_at is null" },
  dismissed: { label: "Đã bỏ qua", sql: "t.dismissed_at is not null" },
  cancelled: { label: "Đã huỷ", sql: "t.cancelled_at is not null and t.working_at is null and t.done_at is null and t.dismissed_at is null" },
  uninstalled: { label: "Đã gỡ app", sql: "t.uninstalled_at is not null" },
} as const;

/* a row is in the queue for its first message, or (sent) for its reminder */
const QUEUE_PART = {
  pending: "(t.status = 'pending' or t.followup_status = 'pending')",
  waiting: "(t.status in ('approved', 'sending') or t.followup_status in ('approved', 'sending'))",
  failed: "(t.status = 'failed' or t.followup_status = 'failed')",
} as const;

const VN = "Asia/Ho_Chi_Minh";

function where(tab: keyof typeof TAB_SQL | null, f: UrspFilters): { sql: string; params: unknown[] } {
  const parts: string[] = tab ? [TAB_SQL[tab]] : [];
  const params: unknown[] = [];
  const add = (clause: (n: number) => string, v: unknown) => {
    params.push(v);
    parts.push(clause(params.length));
  };
  if (f.q?.trim()) add((n) => `(t.store_domain ilike $${n} or t.store_name ilike $${n} or t.email ilike $${n})`, `%${f.q.trim()}%`);
  if (f.seg === "recap" || f.seg === "active") add((n) => `t.segment = $${n}`, f.seg);
  const day = tab === "sent" || tab === "replied" || tab === "working" || tab === "done" || tab === "dismissed" || tab === "cancelled" ? "coalesce(t.sent_at, t.created_at)" : "t.created_at";
  if (f.from) add((n) => `(${day} at time zone '${VN}')::date >= $${n}::date`, f.from);
  if (f.to) add((n) => `(${day} at time zone '${VN}')::date <= $${n}::date`, f.to);
  if (f.reason?.trim()) add((n) => `t.skip_code = $${n}`, f.reason.trim());
  if (f.intent?.trim()) add((n) => `t.reply_intent = $${n}`, f.intent.trim());
  if (f.mood?.trim()) add((n) => `t.mood = $${n}`, f.mood.trim());
  if (f.open === "1") parts.push("t.done_at is null and t.dismissed_at is null and t.working_at is null and t.cancelled_at is null");
  if (f.outcome && Object.hasOwn(OUTCOME, f.outcome)) parts.push(`(${OUTCOME[f.outcome as keyof typeof OUTCOME].sql})`);
  if (f.variant === "A" || f.variant === "B") add((n) => `t.variant = $${n}`, f.variant);
  if (f.seen && Object.hasOwn(SEEN, f.seen)) parts.push(`(${SEEN[f.seen as keyof typeof SEEN].sql})`);
  if (f.status && Object.hasOwn(QUEUE_PART, f.status)) parts.push(QUEUE_PART[f.status]);
  return { sql: parts.length ? `where ${parts.join(" and ")}` : "", params };
}

export type SegmentStats = {
  /** Recap: new rows read since Bắt đầu, and how many were taken (all, or the responsive ones) */
  rows: number;
  responsive: number;
  /** stores looked at (one per store) */
  found: number;
  skipped: number;
  /** kept back for the B half of an A/B test: nothing sent yet */
  held: number;
  queued: number;
  failed: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  agree: number;
  decline: number;
  question: number;
  followup_queued: number;
  followup_sent: number;
  replied_after_followup: number;
  done: number;
  done_open: number;
  working: number;
  dismissed: number;
  cancelled: number;
  upgraded: number;
  upgraded_after_done: number;
  mrr: number;
  reviewed: number;
  reviewed_after_done: number;
  happy: number;
  neutral: number;
  unhappy: number;
  uninstalled: number;
  reasons: { code: string; n: number }[];
};

const STATS_SQL = `count(*)::int as found,
  count(*) filter (where t.status = 'skipped')::int as skipped,
  count(*) filter (where t.status = 'held')::int as held,
  count(*) filter (where t.status in ('pending', 'approved', 'sending'))::int as queued,
  count(*) filter (where t.status = 'failed')::int as failed,
  count(*) filter (where t.status = 'sent')::int as sent,
  count(*) filter (where t.status = 'sent' and t.delivered_at is not null)::int as delivered,
  count(*) filter (where t.status = 'sent' and t.read_at is not null)::int as read,
  count(*) filter (where t.status = 'sent' and t.replied_at is not null)::int as replied,
  count(*) filter (where t.reply_intent = 'agree')::int as agree,
  count(*) filter (where t.reply_intent = 'decline')::int as decline,
  count(*) filter (where t.reply_intent = 'question')::int as question,
  count(*) filter (where t.followup_status in ('pending', 'approved', 'sending'))::int as followup_queued,
  count(*) filter (where t.followup_sent_at is not null)::int as followup_sent,
  count(*) filter (where t.followup_sent_at is not null and t.replied_at >= t.followup_sent_at)::int as replied_after_followup,
  count(*) filter (where t.done_at is not null)::int as done,
  count(*) filter (where t.status = 'sent' and t.replied_at is not null and t.done_at is null and t.dismissed_at is null and t.working_at is null and t.cancelled_at is null)::int as done_open,
  count(*) filter (where t.status = 'sent' and t.working_at is not null and t.done_at is null and t.dismissed_at is null)::int as working,
  count(*) filter (where t.dismissed_at is not null)::int as dismissed,
  count(*) filter (where t.cancelled_at is not null and t.working_at is null and t.done_at is null and t.dismissed_at is null)::int as cancelled,
  count(*) filter (where t.upgraded_at is not null)::int as upgraded,
  count(*) filter (where t.upgraded_at is not null and t.done_at is not null and t.upgraded_at >= t.done_at)::int as upgraded_after_done,
  coalesce(sum(t.upgraded_price) filter (where t.upgraded_at is not null), 0)::float as mrr,
  count(*) filter (where t.reviewed_at is not null)::int as reviewed,
  count(*) filter (where t.reviewed_at is not null and t.done_at is not null and t.reviewed_at >= t.done_at)::int as reviewed_after_done,
  count(*) filter (where t.mood = 'happy')::int as happy,
  count(*) filter (where t.mood = 'neutral')::int as neutral,
  count(*) filter (where t.mood = 'unhappy')::int as unhappy,
  count(*) filter (where t.status = 'sent' and t.uninstalled_at is not null)::int as uninstalled`;

/** Each segment's funnel, over the stores the date / search filters keep. */
export async function segmentStats(f: UrspFilters): Promise<Record<Segment, SegmentStats>> {
  const p = await db();
  const w = where(null, { q: f.q, from: f.from, to: f.to });
  const [main, reasons, recap] = await Promise.all([
    p.query<SegmentStats & { segment: Segment }>(`select t.segment, ${STATS_SQL} from ursp_targets t ${w.sql} group by 1`, w.params),
    p.query<{ segment: Segment; code: string; n: number }>(
      `select t.segment, coalesce(t.skip_code, 'other') as code, count(*)::int as n from ursp_targets t
        ${w.sql ? `${w.sql} and` : "where"} t.status = 'skipped' group by 1, 2 order by 3 desc`,
      w.params,
    ),
    p.query<{ rows: number; responsive: number }>(
      `select count(*)::int as rows, count(*) filter (where responsive)::int as responsive from ursp_recap_rows r
        where ($1::date is null or (r.seen_at at time zone '${VN}')::date >= $1::date)
          and ($2::date is null or (r.seen_at at time zone '${VN}')::date <= $2::date)`,
      [f.from ?? null, f.to ?? null],
    ),
  ]);
  const empty = (): SegmentStats => ({
    rows: 0,
    responsive: 0,
    found: 0,
    skipped: 0,
    held: 0,
    queued: 0,
    failed: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    agree: 0,
    decline: 0,
    question: 0,
    followup_queued: 0,
    followup_sent: 0,
    replied_after_followup: 0,
    done: 0,
    done_open: 0,
    working: 0,
    dismissed: 0,
    cancelled: 0,
    upgraded: 0,
    upgraded_after_done: 0,
    mrr: 0,
    reviewed: 0,
    reviewed_after_done: 0,
    happy: 0,
    neutral: 0,
    unhappy: 0,
    uninstalled: 0,
    reasons: [],
  });
  const out: Record<Segment, SegmentStats> = { recap: empty(), active: empty() };
  for (const { segment, ...r } of main.rows) Object.assign(out[segment], r);
  for (const r of reasons.rows) out[r.segment].reasons.push({ code: r.code, n: r.n });
  Object.assign(out.recap, recap.rows[0]);
  return out;
}

export type DayRow = { day: string; segment: Segment; found: number; skipped: number; sent: number; replied: number; agree: number; done: number };

/** The last 14 days: stores found that day, and of those how many were sent, replied, handled. */
export async function byDay(): Promise<DayRow[]> {
  const { rows } = await (await db()).query<DayRow>(
    `select to_char((t.created_at at time zone '${VN}')::date, 'YYYY-MM-DD') as day, t.segment,
            count(*)::int as found,
            count(*) filter (where t.status = 'skipped')::int as skipped,
            count(*) filter (where t.status = 'sent')::int as sent,
            count(*) filter (where t.replied_at is not null)::int as replied,
            count(*) filter (where t.reply_intent = 'agree')::int as agree,
            count(*) filter (where t.done_at is not null)::int as done
       from ursp_targets t where t.created_at > now() - interval '14 days'
      group by 1, 2 order by 1 desc, 2`,
  );
  return rows;
}

export async function tabCounts(): Promise<Record<string, number>> {
  const p = await db();
  const sel = Object.entries(TAB_SQL)
    .map(([k, sql]) => `count(*) filter (where ${sql})::int as ${k}`)
    .join(", ");
  const { rows } = await p.query<Record<string, number>>(
    `select ${sel}, count(*) filter (where t.status = 'pending' or t.followup_status = 'pending')::int as pending,
            count(*) filter (where ${TAB_SQL.sent} and t.variant = 'A')::int as sent_a,
            count(*) filter (where ${TAB_SQL.sent} and t.variant = 'B')::int as sent_b,
            count(*) filter (where ${TAB_SQL.replied} and t.variant = 'A')::int as replied_a,
            count(*) filter (where ${TAB_SQL.replied} and t.variant = 'B')::int as replied_b,
            count(*) filter (where t.status = 'sent' and t.replied_at is not null and t.done_at is null and t.dismissed_at is null and t.working_at is null and t.cancelled_at is null)::int as replied_open
       from ursp_targets t`,
  );
  return rows[0] ?? {};
}

export async function listTargets(
  tab: keyof typeof TAB_SQL,
  f: UrspFilters,
): Promise<{ rows: UrspTarget[]; total: number; page: number; pages: number }> {
  const p = await db();
  const w = where(tab, f);
  const total = (await p.query<{ n: number }>(`select count(*)::int as n from ursp_targets t ${w.sql}`, w.params)).rows[0].n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(f.page ?? 1) || 1), pages);
  const order =
    tab === "replied"
      ? "t.last_reply_at desc nulls last"
      : tab === "working"
        ? "t.working_at desc"
        : tab === "done"
          ? "t.done_at desc"
          : tab === "dismissed"
            ? "t.dismissed_at desc"
          : tab === "cancelled"
            ? "t.cancelled_at desc"
          : tab === "queue"
        ? "case t.status when 'failed' then 0 when 'pending' then 1 else 2 end, t.created_at"
        : tab === "skipped"
          ? "t.created_at desc"
          : "t.sent_at desc nulls last";
  const { rows } = await p.query<UrspTarget>(`select * from ursp_targets t ${w.sql} order by ${order} limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`, w.params);
  return { rows, total, page, pages };
}

/** The latest Recap rows read, responsive or not — to see what the job saw. */
export async function recentRecapRows(limit = 15): Promise<
  { row_key: string; sheet_row: number | null; recap_at: string | null; store_domain: string | null; category_issue: string | null; resolution: string | null; responsive: boolean | null; target_id: string | null }[]
> {
  const { rows } = await (await db()).query(
    "select row_key, sheet_row, recap_at, store_domain, category_issue, resolution, responsive, target_id from ursp_recap_rows order by seen_at desc, sheet_row desc nulls last limit $1",
    [limit],
  );
  return rows;
}

export async function targetEvents(id: string): Promise<{ type: string; actor: string; detail: Record<string, unknown> | null; at: string }[]> {
  const { rows } = await (await db()).query("select type, actor, detail, at from ursp_events where target_id = $1 order by at desc limit 30", [id]);
  return rows;
}

/* ---------------------------------------------------------------- A/B test */

export type AbArm = {
  variant: "A" | "B";
  sent: number;
  held: number;
  queued: number;
  read: number;
  replied: number;
  agree: number;
  decline: number;
  followup_sent: number;
  replied_after_followup: number;
  done: number;
  upgraded: number;
  reviewed: number;
  happy: number;
  neutral: number;
  unhappy: number;
  /** hours from the message to the first reply, on average */
  reply_hours: number | null;
};

/** Each half of the test: the stores given A or B, and what they did. */
export async function abStats(): Promise<Record<"A" | "B", AbArm>> {
  const { rows } = await (await db()).query<AbArm>(
    `select t.variant,
            count(*) filter (where t.status = 'sent')::int as sent,
            count(*) filter (where t.status = 'held')::int as held,
            count(*) filter (where t.status in ('pending', 'approved', 'sending'))::int as queued,
            count(*) filter (where t.status = 'sent' and t.read_at is not null)::int as read,
            count(*) filter (where t.status = 'sent' and t.replied_at is not null)::int as replied,
            count(*) filter (where t.reply_intent = 'agree')::int as agree,
            count(*) filter (where t.reply_intent = 'decline')::int as decline,
            count(*) filter (where t.followup_sent_at is not null)::int as followup_sent,
            count(*) filter (where t.followup_sent_at is not null and t.replied_at >= t.followup_sent_at)::int as replied_after_followup,
            count(*) filter (where t.done_at is not null)::int as done,
            count(*) filter (where t.upgraded_at is not null)::int as upgraded,
            count(*) filter (where t.reviewed_at is not null)::int as reviewed,
            count(*) filter (where t.mood = 'happy')::int as happy,
            count(*) filter (where t.mood = 'neutral')::int as neutral,
            count(*) filter (where t.mood = 'unhappy')::int as unhappy,
            round((avg(extract(epoch from (t.replied_at - t.sent_at)) / 3600) filter (where t.replied_at is not null))::numeric, 1)::float as reply_hours
       from ursp_targets t where t.variant in ('A', 'B') group by 1`,
  );
  const empty = (variant: "A" | "B"): AbArm => ({
    variant,
    sent: 0,
    held: 0,
    queued: 0,
    read: 0,
    replied: 0,
    agree: 0,
    decline: 0,
    followup_sent: 0,
    replied_after_followup: 0,
    done: 0,
    upgraded: 0,
    reviewed: 0,
    happy: 0,
    neutral: 0,
    unhappy: 0,
    reply_hours: null,
  });
  const out = { A: empty("A"), B: empty("B") };
  for (const r of rows) out[r.variant] = { ...empty(r.variant), ...r };
  return out;
}

export type AbVerdict = {
  /** B's rate minus A's, in points */
  diff: number | null;
  /** two-sided p of a two-proportion z-test; null without enough to test */
  p: number | null;
  /** stores per arm for an 80%-power test at this difference — "how many more to know" */
  needed: number | null;
};

/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
function phi(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Is B's rate different from A's, or is it noise? `x` successes out of `n` sent, per arm. */
export function abVerdict(xa: number, na: number, xb: number, nb: number): AbVerdict {
  if (!na || !nb) return { diff: null, p: null, needed: null };
  const pa = xa / na;
  const pb = xb / nb;
  const diff = Math.round((pb - pa) * 1000) / 10;
  const pool = (xa + xb) / (na + nb);
  const se = Math.sqrt(pool * (1 - pool) * (1 / na + 1 / nb));
  const p = se > 0 ? 2 * (1 - phi(Math.abs(pb - pa) / se)) : null;
  const d = Math.abs(pb - pa);
  const needed = d > 0 ? Math.ceil(((1.96 + 0.84) ** 2 * (pa * (1 - pa) + pb * (1 - pb))) / d ** 2) : null;
  return { diff, p: p === null ? null : Math.round(p * 1000) / 1000, needed };
}

export type AbSegmentRow = { variant: "A" | "B"; segment: Segment; sent: number; held: number; queued: number; read: number; replied: number; agree: number };

/** The same halves split by segment: both should have Recap and Active, in like numbers. */
export async function abBySegment(): Promise<AbSegmentRow[]> {
  const { rows } = await (await db()).query<AbSegmentRow>(
    `select t.variant, t.segment,
            count(*) filter (where t.status = 'sent')::int as sent,
            count(*) filter (where t.status = 'held')::int as held,
            count(*) filter (where t.status in ('pending', 'approved', 'sending'))::int as queued,
            count(*) filter (where t.status = 'sent' and t.read_at is not null)::int as read,
            count(*) filter (where t.status = 'sent' and t.replied_at is not null)::int as replied,
            count(*) filter (where t.reply_intent = 'agree')::int as agree
       from ursp_targets t where t.variant in ('A', 'B') group by 1, 2 order by 2, 1`,
  );
  return rows;
}

/** The notes of the rows on screen, oldest first, by row. */
export async function notesFor(ids: string[]): Promise<Record<string, UrspNote[]>> {
  if (!ids.length) return {};
  const { rows } = await (await db()).query<UrspNote>(
    "select id, target_id, stage, text, by, at, kind from ursp_notes where target_id = any($1::bigint[]) order by at, id",
    [ids],
  );
  const out: Record<string, UrspNote[]> = {};
  for (const n of rows) (out[String(n.target_id)] ??= []).push({ ...n, at: new Date(n.at).toISOString() });
  return out;
}
