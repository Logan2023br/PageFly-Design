import "server-only";

import { db } from "./db";
import type { Segment, UrspTarget } from "./types";

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
  { id: "done", label: "Đã xử lý" },
  { id: "skipped", label: "Bị loại" },
  { id: "settings", label: "Cài đặt" },
] as const;
export type UrspTab = (typeof URSP_TABS)[number]["id"];

const TAB_SQL: Record<Exclude<UrspTab, "overview" | "settings">, string> = {
  queue: "t.status in ('pending', 'approved', 'sending', 'failed')",
  sent: "t.status = 'sent'",
  replied: "t.status = 'sent' and t.replied_at is not null",
  done: "t.status = 'sent' and t.done_at is not null",
  skipped: "t.status = 'skipped'",
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
  /** the queue's parts: pending (Chờ duyệt), waiting (Chờ gửi), failed */
  status?: "pending" | "waiting" | "failed";
  page?: number;
};

const QUEUE_PART = { pending: "t.status = 'pending'", waiting: "t.status in ('approved', 'sending')", failed: "t.status = 'failed'" } as const;

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
  const day = tab === "sent" || tab === "replied" || tab === "done" ? "coalesce(t.sent_at, t.created_at)" : "t.created_at";
  if (f.from) add((n) => `(${day} at time zone '${VN}')::date >= $${n}::date`, f.from);
  if (f.to) add((n) => `(${day} at time zone '${VN}')::date <= $${n}::date`, f.to);
  if (f.reason?.trim()) add((n) => `t.skip_code = $${n}`, f.reason.trim());
  if (f.intent?.trim()) add((n) => `t.reply_intent = $${n}`, f.intent.trim());
  if (f.mood?.trim()) add((n) => `t.mood = $${n}`, f.mood.trim());
  if (f.open === "1") parts.push("t.done_at is null");
  if (f.status && Object.hasOwn(QUEUE_PART, f.status)) parts.push(QUEUE_PART[f.status]);
  return { sql: parts.length ? `where ${parts.join(" and ")}` : "", params };
}

export type SegmentStats = {
  /** Recap: new rows read since Bắt đầu, and how many Haiku called responsive */
  rows: number;
  responsive: number;
  /** stores looked at (one per store) */
  found: number;
  skipped: number;
  queued: number;
  failed: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  agree: number;
  decline: number;
  question: number;
  done: number;
  done_open: number;
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
  count(*) filter (where t.status in ('pending', 'approved', 'sending'))::int as queued,
  count(*) filter (where t.status = 'failed')::int as failed,
  count(*) filter (where t.status = 'sent')::int as sent,
  count(*) filter (where t.status = 'sent' and t.delivered_at is not null)::int as delivered,
  count(*) filter (where t.status = 'sent' and t.read_at is not null)::int as read,
  count(*) filter (where t.status = 'sent' and t.replied_at is not null)::int as replied,
  count(*) filter (where t.reply_intent = 'agree')::int as agree,
  count(*) filter (where t.reply_intent = 'decline')::int as decline,
  count(*) filter (where t.reply_intent = 'question')::int as question,
  count(*) filter (where t.done_at is not null)::int as done,
  count(*) filter (where t.status = 'sent' and t.replied_at is not null and t.done_at is null)::int as done_open,
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
    queued: 0,
    failed: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    agree: 0,
    decline: 0,
    question: 0,
    done: 0,
    done_open: 0,
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
    `select ${sel}, count(*) filter (where t.status = 'pending')::int as pending,
            count(*) filter (where t.status = 'sent' and t.replied_at is not null and t.done_at is null)::int as replied_open
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
      ? "(t.done_at is not null), t.last_reply_at desc nulls last"
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
