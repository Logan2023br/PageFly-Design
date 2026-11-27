import "server-only";

import { db } from "./db";
import type { NffTarget } from "./types";

/* What the Feedback New Feature screen reads. */

export const NFF_TABS = [
  { id: "pending", label: "Chờ duyệt" },
  { id: "sent", label: "Đã gửi" },
  { id: "replied", label: "Khách phản hồi" },
  { id: "skipped", label: "Bỏ qua" },
  { id: "settings", label: "Cài đặt" },
] as const;
export type NffTab = (typeof NFF_TABS)[number]["id"];

const WHERE: Record<Exclude<NffTab, "settings">, string> = {
  pending: "status in ('pending', 'approved', 'failed')",
  sent: "status = 'sent'",
  replied: "status = 'sent' and replied_at is not null",
  skipped: "status = 'skipped'",
};

export type Funnel = {
  /** on Chờ duyệt, not approved yet */
  pending: number;
  /** sending failed, waiting for Gửi lại */
  failed: number;
  queued: number;
  sent: number;
  read: number;
  replied: number;
  funnel: number;
  bundles: number;
  post_purchase: number;
  several: number;
  none: number;
};

export async function funnel(): Promise<Funnel> {
  const { rows } = await (await db()).query<Funnel>(`
    select count(*) filter (where status = 'pending')::int as pending,
           count(*) filter (where status = 'failed')::int as failed,
           count(*) filter (where status in ('pending','approved','failed'))::int as queued,
           count(*) filter (where status = 'sent')::int as sent,
           count(*) filter (where read_at is not null)::int as read,
           count(*) filter (where replied_at is not null)::int as replied,
           count(*) filter (where interest = 'funnel')::int as funnel,
           count(*) filter (where interest = 'bundles')::int as bundles,
           count(*) filter (where interest = 'post_purchase')::int as post_purchase,
           count(*) filter (where interest = 'several')::int as several,
           count(*) filter (where interest = 'none')::int as none
      from nff_targets`);
  return rows[0];
}

export async function tabCounts(): Promise<Record<string, number>> {
  const sel = Object.entries(WHERE)
    .map(([k, w]) => `count(*) filter (where ${w})::int as ${k}`)
    .join(", ");
  const { rows } = await (await db()).query<Record<string, number>>(`select ${sel} from nff_targets`);
  return rows[0] ?? {};
}

export async function listTargets(tab: Exclude<NffTab, "settings">, q?: string): Promise<NffTarget[]> {
  const args: unknown[] = [];
  let extra = "";
  if (q) {
    args.push(`%${q.toLowerCase()}%`);
    extra = ` and (lower(store_domain) like $1 or lower(coalesce(store_name, '')) like $1 or lower(coalesce(email, '')) like $1)`;
  }
  const order = tab === "replied" ? "last_reply_at desc" : tab === "sent" ? "sent_at desc" : "created_at";
  const { rows } = await (await db()).query<NffTarget>(`select * from nff_targets where ${WHERE[tab]}${extra} order by ${order} limit 500`, args);
  return rows;
}
