import "server-only";

import { db } from "./db";
import type { Ucp2Row } from "./core";

/* ==========================================================================
   What the Upsell Collection Pages 2 screen reads: the funnel over the rows
   the filters keep, the same funnel per Type User and per week, and the rows.
   ========================================================================== */

export const PAGE_SIZE = 30;

export type Ucp2Filters = { q?: string; from?: string; to?: string; type?: string; did?: string; page?: number };

/** "Khách đã làm gì" — fixed SQL per key; an unknown key filters nothing. */
export const UCP2_DID = {
  read: { label: "Đã đọc", sql: "r.read_at is not null" },
  not_read: { label: "Chưa đọc", sql: "r.read_at is null" },
  clicked: { label: "Đã click link", sql: "r.clicked_at is not null" },
  downloaded: { label: "Đã tải template", sql: "r.downloaded_at is not null" },
  replied: { label: "Đã phản hồi", sql: "r.replied_at is not null" },
  upgraded: { label: "Đã nâng cấp", sql: "r.upgraded_at is not null" },
  reviewed: { label: "Đã review 5★", sql: "r.reviewed_at is not null" },
  uninstalled: { label: "Đã gỡ app", sql: "r.uninstalled_at is not null" },
} as const;
export type Ucp2Did = keyof typeof UCP2_DID;

/** The funnel, in the order the screen shows it. */
export const FUNNEL = ["read", "clicked", "downloaded", "replied", "upgraded", "reviewed", "uninstalled"] as const satisfies readonly Ucp2Did[];

const VN = "Asia/Ho_Chi_Minh";

function where(f: Ucp2Filters, skipDid = false): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  const add = (clause: (n: number) => string, v: unknown) => {
    params.push(v);
    parts.push(clause(params.length));
  };
  if (f.q?.trim())
    add((n) => `(r.store_domain ilike $${n} or r.store_name ilike $${n} or r.email ilike $${n} or r.code ilike $${n})`, `%${f.q.trim()}%`);
  if (f.from) add((n) => `(r.sent_at at time zone '${VN}')::date >= $${n}::date`, f.from);
  if (f.to) add((n) => `(r.sent_at at time zone '${VN}')::date <= $${n}::date`, f.to);
  if (f.type?.trim()) add((n) => `r.type_user = $${n}`, f.type.trim());
  if (!skipDid && f.did && Object.hasOwn(UCP2_DID, f.did)) parts.push(`(${UCP2_DID[f.did as Ucp2Did].sql})`);
  return { sql: parts.length ? `where ${parts.join(" and ")}` : "", params };
}

const FUNNEL_SQL = `count(*)::int as sent,
  ${FUNNEL.map((k) => `count(*) filter (where ${UCP2_DID[k].sql})::int as ${k}`).join(",\n  ")},
  count(*) filter (where r.delivered_at is not null)::int as delivered,
  coalesce(sum(r.clicks), 0)::int as clicks,
  coalesce(sum(r.upgraded_price) filter (where r.upgraded_at is not null), 0)::float as mrr`;

export type Funnel = { sent: number; delivered: number; clicks: number; mrr: number } & Record<(typeof FUNNEL)[number], number>;

/** The funnel over everything the filters keep (not the "đã làm gì" one: the funnel is what it splits). */
export async function ucp2Stats(f: Ucp2Filters): Promise<{ all: Funnel; byType: (Funnel & { type: string })[]; byWeek: (Funnel & { week: string })[] }> {
  const p = await db();
  const w = where(f, true);
  const [all, byType, byWeek] = await Promise.all([
    p.query<Funnel>(`select ${FUNNEL_SQL} from ucp2_rows r ${w.sql}`, w.params),
    p.query<Funnel & { type: string }>(
      `select coalesce(r.type_user, '(trống)') as type, ${FUNNEL_SQL} from ucp2_rows r ${w.sql} group by 1 order by sent desc`,
      w.params,
    ),
    p.query<Funnel & { week: string }>(
      `select to_char(date_trunc('week', r.sent_at at time zone '${VN}'), 'YYYY-MM-DD') as week, ${FUNNEL_SQL}
         from ucp2_rows r ${w.sql} group by 1 order by 1 desc limit 12`,
      w.params,
    ),
  ]);
  return { all: all.rows[0], byType: byType.rows, byWeek: byWeek.rows };
}

export async function ucp2List(f: Ucp2Filters): Promise<{ rows: Ucp2Row[]; total: number; page: number; pages: number }> {
  const p = await db();
  const w = where(f);
  const total = (await p.query<{ n: number }>(`select count(*)::int as n from ucp2_rows r ${w.sql}`, w.params)).rows[0].n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(f.page ?? 1) || 1), pages);
  const { rows } = await p.query<Ucp2Row>(
    `select * from ucp2_rows r ${w.sql} order by r.sent_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`,
    w.params,
  );
  return { rows, total, page, pages };
}

export async function ucp2Types(): Promise<string[]> {
  const { rows } = await (await db()).query<{ t: string }>("select distinct type_user as t from ucp2_rows where type_user is not null order by 1");
  return rows.map((r) => r.t);
}

/** The timeline of one row, newest first. */
export async function ucp2Events(sessionId: string): Promise<{ type: string; actor: string; detail: Record<string, unknown> | null; at: string }[]> {
  const { rows } = await (await db()).query(
    "select type, actor, detail, at from ucp2_events where session_id = $1 order by at desc limit 50",
    [sessionId],
  );
  return rows;
}
