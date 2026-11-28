import "server-only";

import { db } from "./db";
import type { RsoTarget } from "./types";

/* What the Radar Sold Out screen reads. */

export const RSO_TABS = [
  { id: "todo", label: "Cần làm" },
  { id: "sent", label: "Đã gửi" },
  { id: "upgraded", label: "Đã nâng cấp" },
  { id: "skipped", label: "Bị loại" },
  { id: "settings", label: "Cài đặt" },
] as const;
export type RsoTab = (typeof RSO_TABS)[number]["id"];

export type Funnel = {
  found: number;
  skipped: number;
  sent: number;
  read: number;
  replied: number;
  stopped: number;
  checked: number;
  restocked: number;
  review_asked: number;
  reviewed: number;
  visits_saved: number;
  upgraded: number;
  upgraded_organic: number;
  upgraded_normal: number;
  upgraded_mrr: number;
};

export async function funnel(): Promise<Funnel> {
  const { rows } = await (await db()).query<Funnel>(`
    select count(*)::int as found,
           count(*) filter (where status = 'skipped')::int as skipped,
           count(*) filter (where sent_at is not null)::int as sent,
           count(*) filter (where read_at is not null)::int as read,
           count(*) filter (where replied_at is not null)::int as replied,
           count(*) filter (where stage = 'stopped')::int as stopped,
           count(*) filter (where stage in ('still_out','restocked','restocked_no_ask','review_asked','reviewed','no_review'))::int as checked,
           count(*) filter (where restocked_at is not null)::int as restocked,
           count(*) filter (where review_asked_at is not null)::int as review_asked,
           count(*) filter (where reviewed_at is not null)::int as reviewed,
           coalesce(sum(visits) filter (where restocked_at is not null), 0)::int as visits_saved,
           count(*) filter (where upgraded_at is not null)::int as upgraded,
           count(*) filter (where upgraded_at is not null and read_at is not null and read_at <= upgraded_at)::int as upgraded_organic,
           count(*) filter (where upgraded_at is not null and (read_at is null or read_at > upgraded_at))::int as upgraded_normal,
           coalesce(sum(upgraded_price) filter (where upgraded_at is not null), 0)::float as upgraded_mrr
      from rso_targets`);
  return rows[0];
}

export async function tabCounts(): Promise<Record<RsoTab, number>> {
  const { rows } = await (await db()).query<{ todo: number; sent: number; skipped: number; upgraded: number }>(`
    select count(*) filter (where status in ('pending','failed') or review_status in ('pending','failed') or stage = 'manual'
                              or (stage = 'replied' and reply_intent in ('help','other','discontinued')))::int as todo,
           count(*) filter (where status = 'sent')::int as sent,
           count(*) filter (where status = 'skipped')::int as skipped,
           count(*) filter (where upgraded_at is not null)::int as upgraded
      from rso_targets`);
  return { ...rows[0], settings: 0 };
}

export async function listTargets(tab: RsoTab, q?: string): Promise<RsoTarget[]> {
  const where =
    tab === "todo"
      ? `(status in ('pending','failed','approved') or review_status in ('pending','failed','approved') or stage = 'manual'
          or (stage = 'replied' and reply_intent in ('help','other','discontinued')))`
      : tab === "sent"
        ? "status = 'sent'"
        : tab === "upgraded"
          ? "upgraded_at is not null"
          : "status = 'skipped'";
  const args: unknown[] = [];
  let extra = "";
  if (q) {
    args.push(`%${q.toLowerCase()}%`);
    extra = ` and (lower(store_domain) like $1 or lower(coalesce(store_name,'')) like $1)`;
  }
  const order = tab === "sent" ? "sent_at desc" : tab === "upgraded" ? "upgraded_at desc" : tab === "todo" ? "visits desc" : "created_at desc";
  const { rows } = await (await db()).query<RsoTarget>(`select * from rso_targets where ${where}${extra} order by ${order} limit 300`, args);
  return rows;
}
