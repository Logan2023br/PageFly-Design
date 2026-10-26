import "server-only";

import { db } from "./db";
import { getInternal } from "./settings";
import type { SsuCustomer, SsuEvent, SsuJobState, SsuMessage, SsuSelection } from "./types";

/* ==========================================================================
   What the admin screen reads. Each tab is a filter on ssu_customers (or the
   selection feed, or the message queue); the filters are in the URL.
   ========================================================================== */

export const SSU_TABS = [
  { id: "all", label: "Tất cả khách", where: "true" },
  { id: "stores", label: "Store dùng page sets", where: null },
  { id: "feed", label: "Mỗi lượt click", where: null },
  { id: "pending", label: "Chờ duyệt", where: null },
  { id: "waiting", label: "Chờ gửi", where: null },
  { id: "sent", label: "Đã gửi", where: "c.sent_at is not null" },
  { id: "read", label: "Đã đọc", where: "c.read_at is not null" },
  { id: "replied", label: "Có phản hồi", where: "c.replied" },
  { id: "needs_check", label: "Cần kiểm tra", where: "c.needs_check" },
  { id: "cared", label: "Đã chăm sóc", where: "exists (select 1 from ssu_messages x where x.store_domain = c.store_domain and x.status = 'sent' and x.kind in ('care_read', 'care_upgraded', 'edit_reminder'))" },
  { id: "review_asked", label: "Đã xin review", where: "c.review_asked_at is not null" },
  { id: "reviewed", label: "Đã review 5★", where: "c.app_review >= 5" },
  { id: "updated", label: "Đã nâng cấp / cập nhật", where: "(c.upgraded_at is not null or c.pages_updated_at is not null)" },
  { id: "eligible", label: "Đủ điều kiện, chưa gửi", where: "c.status in ('eligible', 'new')" },
  { id: "skipped", label: "Bỏ qua", where: "c.status in ('skipped', 'reviewed')" },
  { id: "failed", label: "Lỗi gửi", where: null },
  { id: "settings", label: "Cài đặt", where: null },
] as const;
export type SsuTabId = (typeof SSU_TABS)[number]["id"];

export type SsuFilters = { q?: string; set?: string; from?: string; to?: string; app?: string; status?: string; kind?: string; page: number };

export const PAGE_SIZE = 50;

function customerWhere(tab: SsuTabId, f: SsuFilters): { sql: string; args: unknown[] } {
  const args: unknown[] = [];
  const parts: string[] = [SSU_TABS.find((t) => t.id === tab)?.where ?? "true"];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    parts.push(sql.replace(/\?/g, `$${args.length}`));
  };
  if (f.q) add("(c.store_domain ilike ? or c.email ilike ? or c.store_name ilike ? or c.phone ilike ?)", `%${f.q.trim()}%`);
  if (f.set) add("? = any(c.sets)", f.set);
  if (f.from) add("c.last_selected_at >= ?::date", f.from);
  if (f.to) add("c.last_selected_at < ?::date + 1", f.to);
  if (f.app === "installed") parts.push("coalesce(c.app_status, 'installed') = 'installed'");
  if (f.app === "uninstalled") parts.push("c.app_status = 'uninstalled'");
  if (f.status) add("c.status = ?", f.status);
  return { sql: parts.join(" and "), args };
}

export type CustomerListRow = SsuCustomer & {
  last_message_status: string | null;
  last_message_kind: string | null;
  /** the store set pages they picked (template names), first first */
  pages_used: string[];
};

/* The pages a store picked: distinct template names, in the order first picked. */
const PAGES_USED = `left join lateral (
    select coalesce(array_agg(page order by first), '{}') as pages_used
      from (select coalesce(template_id, store_set || ' · ' || coalesce(page_type, 'page')) as page, min(event_time) as first
              from ssu_selections where store_domain = c.store_domain group by 1) q
  ) pu on true`;

export async function listCustomers(tab: SsuTabId, f: SsuFilters): Promise<{ rows: CustomerListRow[]; total: number; page: number; pages: number }> {
  const p = await db();
  const w = customerWhere(tab, f);
  const order =
    tab === "needs_check" || tab === "replied"
      ? "c.last_reply_at desc nulls last"
      : tab === "sent" || tab === "read"
        ? "c.sent_at desc nulls last"
        : "c.last_selected_at desc nulls last";
  const total = Number((await p.query(`select count(*) as n from ssu_customers c where ${w.sql}`, w.args)).rows[0].n);
  const page = Math.max(1, Math.floor(f.page) || 1);
  const { rows } = await p.query<CustomerListRow>(
    `select c.*, m.status as last_message_status, m.kind as last_message_kind, pu.pages_used
       from ssu_customers c
       left join lateral (select status, kind from ssu_messages where store_domain = c.store_domain order by created_at desc limit 1) m on true
       ${PAGES_USED}
      where ${w.sql} order by ${order} limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`,
    w.args,
  );
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type MessageListRow = SsuMessage & {
  store_name: string | null;
  email: string | null;
  phone: string | null;
  sets: string[];
  app_review: number | null;
  crisp_conversations: number | null;
  last_selected_at: string | null;
  pf_plan: string | null;
  ticket_link: string | null;
};

export async function listMessages(statuses: string[], f: SsuFilters): Promise<{ rows: MessageListRow[]; total: number; page: number; pages: number }> {
  const p = await db();
  const w = customerWhere("all", f);
  const n = w.args.length;
  let sql = `from ssu_messages m join ssu_customers c on c.store_domain = m.store_domain where m.status = any($${n + 1}) and ${w.sql}`;
  const args: unknown[] = [...w.args, statuses];
  if (f.kind) {
    args.push(f.kind);
    sql += ` and m.kind = $${args.length}`;
  }
  const total = Number((await p.query(`select count(*) as n ${sql}`, args)).rows[0].n);
  const page = Math.max(1, Math.floor(f.page) || 1);
  const { rows } = await p.query<MessageListRow>(
    `select m.*, c.store_name, c.email, c.phone, c.sets, c.app_review, c.crisp_conversations, c.last_selected_at, c.pf_plan, c.ticket_link
       ${sql} order by m.created_at desc limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}`,
    args,
  );
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** The feed, newest first, for the "per minute" tab. */
export async function listSelections(f: SsuFilters, limit = 300): Promise<(SsuSelection & { store_name: string | null; status: string | null })[]> {
  const p = await db();
  const args: unknown[] = [];
  const parts = ["true"];
  if (f.q) {
    args.push(`%${f.q.trim()}%`);
    parts.push(`(s.store_domain ilike $${args.length} or s.email ilike $${args.length})`);
  }
  if (f.set) {
    args.push(f.set);
    parts.push(`s.store_set = $${args.length}`);
  }
  if (f.from) {
    args.push(f.from);
    parts.push(`s.event_time >= $${args.length}::date`);
  }
  if (f.to) {
    args.push(f.to);
    parts.push(`s.event_time < $${args.length}::date + 1`);
  }
  const { rows } = await p.query(
    `select s.*, c.store_name, c.status from ssu_selections s left join ssu_customers c on c.store_domain = s.store_domain
      where ${parts.join(" and ")} order by s.event_time desc limit ${limit}`,
    args,
  );
  return rows;
}

/* ---------------------------------------------------------------- stores using page sets */

export type StoreRow = CustomerListRow & { page_count: number; days_on_app: number | null };

export type StoreStats = {
  rows: StoreRow[];
  total: number;
  page: number;
  pages: number;
  summary: {
    stores: number;
    installed: number;
    paid: number;
    page_uses: number;
    avg_pages: number;
    avg_days_on_app: number | null;
    by_set: { store_set: string; stores: number; pages: number }[];
    by_plan: { plan: string; stores: number }[];
    by_country: { country: string; stores: number }[];
  };
};

/** One row per store that picked a Store set page: the pages it uses, and
    the store (install date, days on the app, plans, country, pages). */
export async function storeStats(f: SsuFilters, limit = 100): Promise<StoreStats> {
  const p = await db();
  const w = customerWhere("all", f);
  const total = Number((await p.query(`select count(*) as n from ssu_customers c where ${w.sql}`, w.args)).rows[0].n);
  const page = Math.max(1, Math.floor(f.page) || 1);
  const { rows } = await p.query<StoreRow>(
    `select c.*, null as last_message_status, null as last_message_kind, pu.pages_used,
            cardinality(pu.pages_used) as page_count,
            case when c.installed_at is not null then floor(extract(epoch from (coalesce(c.uninstalled_at, now()) - c.installed_at)) / 86400)::int end as days_on_app
       from ssu_customers c ${PAGES_USED}
      where ${w.sql} order by cardinality(pu.pages_used) desc, c.last_selected_at desc
      limit ${limit} offset ${(page - 1) * limit}`,
    w.args,
  );
  const sum = (
    await p.query(
      `select count(*) as stores,
              count(*) filter (where coalesce(c.app_status, 'installed') = 'installed') as installed,
              count(*) filter (where coalesce(c.pf_price, 0) > 0) as paid,
              avg(extract(epoch from (coalesce(c.uninstalled_at, now()) - c.installed_at)) / 86400) as avg_days
         from ssu_customers c where ${w.sql}`,
      w.args,
    )
  ).rows[0];
  const uses = (
    await p.query(
      `select count(distinct (s.store_domain, coalesce(s.template_id, s.store_set || s.page_type))) as n
         from ssu_selections s join ssu_customers c on c.store_domain = s.store_domain where ${w.sql}`,
      w.args,
    )
  ).rows[0];
  const bySet = await p.query(
    `select s.store_set, count(distinct s.store_domain) as stores, count(distinct (s.store_domain, coalesce(s.template_id, s.page_type))) as pages
       from ssu_selections s join ssu_customers c on c.store_domain = s.store_domain where ${w.sql}
      group by 1 order by 2 desc`,
    w.args,
  );
  const byPlan = await p.query(
    `select coalesce(c.pf_plan, 'Chưa rõ') as plan, count(*) as stores from ssu_customers c where ${w.sql} group by 1 order by 2 desc limit 12`,
    w.args,
  );
  const byCountry = await p.query(
    `select coalesce(c.country, 'Chưa rõ') as country, count(*) as stores from ssu_customers c where ${w.sql} group by 1 order by 2 desc limit 12`,
    w.args,
  );
  const stores = Number(sum.stores);
  return {
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    summary: {
      stores,
      installed: Number(sum.installed),
      paid: Number(sum.paid),
      page_uses: Number(uses.n),
      avg_pages: stores ? Number(uses.n) / stores : 0,
      avg_days_on_app: sum.avg_days === null ? null : Number(sum.avg_days),
      by_set: bySet.rows.map((r) => ({ store_set: r.store_set, stores: Number(r.stores), pages: Number(r.pages) })),
      by_plan: byPlan.rows.map((r) => ({ plan: r.plan, stores: Number(r.stores) })),
      by_country: byCountry.rows.map((r) => ({ country: r.country, stores: Number(r.stores) })),
    },
  };
}

export async function ssuCounts(): Promise<Record<string, number>> {
  const p = await db();
  const cols = SSU_TABS.filter((t) => t.where).map((t) => `count(*) filter (where ${t.where}) as "${t.id}"`);
  const { rows } = await p.query(`select ${cols.join(", ")} from ssu_customers c`);
  const m = await p.query<{ status: string; n: number }>("select status, count(*) as n from ssu_messages group by status");
  const by = Object.fromEntries(m.rows.map((r) => [r.status, Number(r.n)]));
  const today = await p.query("select count(*) as n from ssu_selections where event_time > now() - interval '24 hours'");
  return {
    ...Object.fromEntries(Object.entries(rows[0] ?? {}).map(([k, v]) => [k, Number(v)])),
    pending: by.pending_review ?? 0,
    waiting: (by.approved ?? 0) + (by.sending ?? 0),
    failed: by.failed ?? 0,
    feed: Number(today.rows[0].n),
    stores: Number(rows[0]?.all ?? 0),
  };
}

export async function setOptions(): Promise<string[]> {
  const p = await db();
  const { rows } = await p.query<{ store_set: string }>("select distinct store_set from ssu_selections order by store_set");
  return rows.map((r) => r.store_set);
}

export async function customerDetail(domain: string): Promise<{
  selections: SsuSelection[];
  messages: SsuMessage[];
  events: SsuEvent[];
}> {
  const p = await db();
  const [s, m, e] = await Promise.all([
    p.query<SsuSelection>("select * from ssu_selections where store_domain = $1 order by event_time desc limit 100", [domain]),
    p.query<SsuMessage>("select * from ssu_messages where store_domain = $1 order by created_at desc", [domain]),
    p.query<SsuEvent>("select * from ssu_events where store_domain = $1 order by created_at desc limit 100", [domain]),
  ]);
  return { selections: s.rows, messages: m.rows, events: e.rows };
}

export async function jobState(): Promise<{ job: SsuJobState | null; cursor: string | null }> {
  const [job, cursor] = await Promise.all([getInternal<SsuJobState>("job"), getInternal<string>("cursor")]);
  return { job, cursor };
}
