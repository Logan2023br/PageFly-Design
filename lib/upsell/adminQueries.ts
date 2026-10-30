import "server-only";

import { db } from "./db";
import { getDesignForLead, type DesignView } from "./designs";
import { LEAD_SELECT, shapeLead, type LeadListRow } from "./leads";
import type { AutoKind, EventRow, InstallRow, LeadStatus, MessageRow } from "./types";

/* ==========================================================================
   What the admin screens read. Every list goes through the same filter
   builder, so "PIC = Logan" means the same thing on every tab.
   ========================================================================== */

export const PAGE_SIZE = 24;

export type Filters = {
  q?: string;
  from?: string; // yyyy-mm-dd, on the tab's date column
  to?: string;
  pic?: string;
  cat?: string;
  min_score?: string;
  /** what the customer did — a key of LEAD_ACTIVITY */
  act?: string;
  /** which messages on the Tin nhắn tab — a key of MESSAGE_GROUPS */
  group?: string;
  /** the sent list on the Tin nhắn tab: "1" read by the customer, "0" not yet */
  read?: string;
  /** Có phản hồi: "0" not checked yet, "1" checked */
  check?: string;
  page?: number;
};

/* "Khách đã làm gì": the activity filter. Fixed SQL per key, nothing from the
   request is interpolated — an unknown key filters nothing. */
const customerDid = (type: string) =>
  `exists (select 1 from upsell_events e join upsell_designs dd on dd.id = e.design_id
            where dd.lead_id = l.lead_id and e.actor = 'customer' and e.type = '${type}')`;
export const LEAD_ACTIVITY = {
  downloaded: { label: "Đã tải", sql: customerDid("download") },
  viewed: { label: "Đã xem", sql: customerDid("view") },
  viewed_not_downloaded: { label: "Đã xem, chưa tải", sql: `${customerDid("view")} and not ${customerDid("download")}` },
  not_viewed: { label: "Chưa xem", sql: `not ${customerDid("view")}` },
  read: { label: "Đã đọc tin", sql: "l.message_read is true" },
  replied: { label: "Đã phản hồi", sql: "l.replied is true" },
  whatsapp: { label: "Đã gửi WhatsApp", sql: "l.whatsapp_sent_at is not null" },
  no_whatsapp: { label: "Chưa gửi WhatsApp", sql: "l.whatsapp_sent_at is null and l.whatsapp_skipped_at is null" },
  whatsapp_skipped: { label: "Không dùng WhatsApp", sql: "l.whatsapp_skipped_at is not null" },
} as const;

/** Viewed + read + downloaded + upgraded: the lead counted as "Upsell Submit". */
export const FULL_FUNNEL = `${customerDid("view")} and ${customerDid("download")} and l.message_read is true and l.upgraded is true`;

export type Paged<T> = { rows: T[]; total: number; page: number; pages: number };

/** Lead tabs: which statuses (or a fixed condition), which date column,
    which order. */
export const LEAD_TABS: Record<string, { statuses: readonly string[] | null; where?: string; date: string; order: string }> = {
  pages: { statuses: ["pending_review"], date: "built_at", order: "l.built_at asc nulls last" },
  /* Theo dõi tất cả: every lead whose pages went out, upgraded ones included —
     Đã nâng cấp is the same leads narrowed, not a place they move to. */
  tracking: { statuses: ["sent", "viewed", "downloaded", "used", "upgraded"], date: "sent_at", order: "l.sent_at desc nulls last" },
  upgraded: { statuses: null, where: "l.upgraded is true", date: "upgraded_at", order: "l.upgraded_at desc nulls last" },
  /* Có phản hồi: the same leads as Theo dõi tất cả, narrowed — as on Store
     set upsell. Đã đọc lives on the Tin nhắn tab, under each message. */
  replied: { statuses: null, where: "l.replied is true", date: "last_reply_at", order: "l.last_reply_at desc nulls last" },
  /* On the Tin nhắn tab: viewed the pages, read the message, downloaded and
     upgraded — all four. */
  full: { statuses: null, where: FULL_FUNNEL, date: "upgraded_at", order: "l.upgraded_at desc nulls last" },
  queue: { statuses: ["new", "building", "rebuild_requested"], date: "created_at", order: "(l.priority = 'high') desc, l.lead_score desc nulls last, l.created_at asc" },
  control: { statuses: ["control"], date: "created_at", order: "l.created_at desc" },
  closed: { statuses: ["rejected", "error", "skipped", "uninstalled"], date: "updated_at", order: "l.updated_at desc" },
};
export type LeadTab = "pages" | "tracking" | "upgraded" | "replied" | "full" | "queue" | "control" | "closed";

/** How many leads did all four: viewed, read, downloaded, upgraded. */
export async function fullFunnelCount(): Promise<number> {
  const { rows } = await (await db()).query<{ n: number }>(`select count(*)::int as n from upsell_leads l where ${FULL_FUNNEL}`);
  return rows[0]?.n ?? 0;
}

/* Dates are typed in Vietnam time (the team's) and compared as such. */
const VN = "Asia/Ho_Chi_Minh";

function leadWhere(f: Filters, col: string, alias = "l"): { sql: string[]; params: unknown[] } {
  const sql: string[] = [];
  const params: unknown[] = [];
  const add = (clause: (n: number) => string, v: unknown) => {
    params.push(v);
    sql.push(clause(params.length));
  };
  if (f.q?.trim())
    add((n) => `(${alias}.store_domain ilike $${n} or ${alias}.store_name ilike $${n} or ${alias}.email ilike $${n} or ${alias}.lead_id ilike $${n})`, `%${f.q.trim()}%`);
  if (f.from) add((n) => `(${alias}.${col} at time zone '${VN}')::date >= $${n}::date`, f.from);
  if (f.to) add((n) => `(${alias}.${col} at time zone '${VN}')::date <= $${n}::date`, f.to);
  if (f.pic?.trim()) add((n) => `${alias}.pic ilike $${n}`, f.pic.trim());
  if (f.cat?.trim()) add((n) => `${alias}.category_hint ilike $${n}`, `%${f.cat.trim()}%`);
  if (f.min_score && Number.isFinite(Number(f.min_score))) add((n) => `${alias}.lead_score >= $${n}`, Number(f.min_score));
  /* Leads only (alias l): installs have no design to have been viewed. */
  if (alias === "l" && f.act && Object.hasOwn(LEAD_ACTIVITY, f.act)) sql.push(`(${LEAD_ACTIVITY[f.act as keyof typeof LEAD_ACTIVITY].sql})`);
  return { sql, params };
}

function paging(total: number, page = 1): { page: number; pages: number; offset: number } {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { page: p, pages, offset: (p - 1) * PAGE_SIZE };
}

export async function listLeadTab(tab: LeadTab, f: Filters): Promise<Paged<LeadListRow>> {
  const def = LEAD_TABS[tab];
  const w = leadWhere(f, def.date);
  if (def.statuses) {
    w.params.push(def.statuses);
    w.sql.push(`l.status = any($${w.params.length}::text[])`);
  }
  if (def.where) w.sql.push(def.where);
  const where = w.sql.length ? `where ${w.sql.join(" and ")}` : "";
  const p = await db();
  const count = await p.query<{ n: number }>(`select count(*) as n from upsell_leads l ${where}`, w.params);
  const total = count.rows[0].n;
  const pg = paging(total, f.page);
  const { rows } = await p.query(`${LEAD_SELECT} ${where} order by ${def.order} limit ${PAGE_SIZE} offset ${pg.offset}`, w.params);
  return { rows: rows.map(shapeLead), total, page: pg.page, pages: pg.pages };
}

const MESSAGE_ORDER = {
  pending_review: "m.created_at asc",
  approved: "(m.send_mode='now') desc, m.approved_at asc",
  failed: "m.failed_at desc nulls last, m.created_at desc",
} as const;

export type MessageListRow = MessageRow & {
  store_domain: string;
  store_name: string | null;
  timezone: string | null;
  country: string | null;
  pic: string | null;
  lead_status: LeadStatus;
  sent_at_lead: string | null;
  unique_views: number;
  downloads: number;
  rating: number | null;
  sentiment: string | null;
  feedback_summary: string | null;
  crisp_session: string | null;
  ticket_link: string | null;
  phone: string | null;
  whatsapp_sent_at: string | null;
  whatsapp_sent_by: string | null;
  whatsapp_skipped_at: string | null;
  whatsapp_skipped_by: string | null;
};

/* ==========================================================================
   The Tin nhắn tab's three groups, each with the setting that decides
   whether its messages wait for an admin (manual) or go out (auto).
   ========================================================================== */
export const MESSAGE_GROUPS = {
  build: { label: "Tin nhắn build page", kinds: ["initial", "followup1", "followup2", "review", "custom"], setting: "build_message_mode" },
  viewed: { label: "Tin nhắn khách đã xem", kinds: ["view_reminder"], setting: "view_reminder_mode" },
  downloaded: { label: "Tin nhắn khách đã tải", kinds: ["edit_offer"], setting: "edit_offer_mode" },
} as const;
export type MessageGroup = keyof typeof MESSAGE_GROUPS;
export const groupOf = (g: string | undefined): MessageGroup => (g && Object.hasOwn(MESSAGE_GROUPS, g) ? (g as MessageGroup) : "build");

export async function listMessages(
  status: "pending_review" | "approved" | "failed",
  f: Filters,
  kinds?: readonly string[],
): Promise<Paged<MessageListRow>> {
  const w = leadWhere(f, "created_at");
  if (kinds) {
    w.params.push(kinds);
    w.sql.push(`m.kind = any($${w.params.length}::text[])`);
  }
  /* The date filter is on the message here, not the lead. */
  w.sql = w.sql.map((s) => s.replace("(l.created_at at time zone", "(m.created_at at time zone"));
  w.params.push(status);
  w.sql.push(`m.status = $${w.params.length}`);
  const where = `where ${w.sql.join(" and ")}`;
  const p = await db();
  const base = `from upsell_messages m join upsell_leads l on l.lead_id = m.lead_id left join upsell_designs d on d.lead_id = l.lead_id`;
  const count = await p.query<{ n: number }>(`select count(*) as n ${base} ${where}`, w.params);
  const total = count.rows[0].n;
  const pg = paging(total, f.page);
  const { rows } = await p.query<MessageListRow>(
    `select m.*, l.store_domain, l.store_name, l.timezone, l.country, l.pic, l.status as lead_status, l.sent_at as sent_at_lead,
            l.sentiment, l.feedback_summary, l.crisp_session, l.ticket_link, l.phone,
            l.whatsapp_sent_at, l.whatsapp_sent_by, l.whatsapp_skipped_at, l.whatsapp_skipped_by,
            coalesce((select count(distinct visitor_id) from upsell_events e where e.design_id = d.id and e.actor='customer' and e.type='view'),0) as unique_views,
            coalesce((select count(*) from upsell_events e where e.design_id = d.id and e.actor='customer' and e.type='download'),0) as downloads,
            (select rating from upsell_events e where e.design_id = d.id and e.actor='customer' and e.type='feedback' and e.rating is not null order by created_at desc limit 1) as rating
       ${base} ${where}
      order by ${MESSAGE_ORDER[status]}
      limit ${PAGE_SIZE} offset ${pg.offset}`,
    w.params,
  );
  return { rows, total, page: pg.page, pages: pg.pages };
}

/* ---- automatic messages --------------------------------------------------- */

export type AutoMessageRow = MessageRow & {
  store_domain: string;
  store_name: string | null;
  phone: string | null;
  lead_status: LeadStatus;
  whatsapp_sent_at: string | null;
  whatsapp_sent_by: string | null;
  whatsapp_skipped_at: string | null;
  whatsapp_skipped_by: string | null;
  /** Crisp's read receipt, for the conversation: BPU Ops sets it once the
      customer has read a message we sent there. */
  message_read: boolean | null;
  /** the Crisp conversation the messages went to */
  ticket_link: string | null;
};

/** Messages of some kinds in some statuses, the latest first — the sent
    list under each group of the Tin nhắn tab. `read` narrows it to the
    customers who read it (true) or have not yet (false). */
export async function listMessagesOfKinds(
  kinds: readonly string[],
  statuses: readonly string[],
  limit = 100,
  read: boolean | null = null,
): Promise<AutoMessageRow[]> {
  const p = await db();
  const { rows } = await p.query<AutoMessageRow>(
    `select m.*, l.store_domain, l.store_name, l.phone, l.status as lead_status,
            l.whatsapp_sent_at, l.whatsapp_sent_by, l.whatsapp_skipped_at, l.whatsapp_skipped_by, l.message_read, l.ticket_link
       from upsell_messages m join upsell_leads l on l.lead_id = m.lead_id
      where m.kind = any($1::text[]) and m.status = any($2::text[])
        and ($4::boolean is null or coalesce(l.message_read, false) = $4)
      order by coalesce(m.sent_at, m.approved_at, m.created_at) desc
      limit $3`,
    [kinds, statuses, limit, read],
  );
  return rows;
}

/* ---- replies, by the message they answer ---------------------------------- */

/** The kind of the last message sent before the customer's reply — what the
    reply answers. A reply before any recorded send counts as the first. */
const REPLY_TO = `coalesce((select m.kind from upsell_messages m
    where m.lead_id = l.lead_id and m.status = 'sent' and m.sent_at <= l.last_reply_at
    order by m.sent_at desc limit 1), 'initial')`;
const UNCHECKED = "(l.reply_checked_at is null or l.reply_checked_at < l.last_reply_at)";

const groupOfKind = (kind: string): MessageGroup =>
  (Object.entries(MESSAGE_GROUPS).find(([, d]) => (d.kinds as readonly string[]).includes(kind))?.[0] as MessageGroup) ?? "build";

export type ReplyRow = LeadListRow & { reply_to_kind: string };

/** Per group: replies, and how many of them nobody has checked. */
export async function replyCounts(): Promise<Record<MessageGroup, { total: number; unchecked: number }>> {
  const { rows } = await (await db()).query<{ kind: string; total: number; unchecked: number }>(
    `select ${REPLY_TO} as kind, count(*)::int as total, count(*) filter (where ${UNCHECKED})::int as unchecked
       from upsell_leads l where l.replied is true and l.last_reply_at is not null group by 1`,
  );
  const out = { build: { total: 0, unchecked: 0 }, viewed: { total: 0, unchecked: 0 }, downloaded: { total: 0, unchecked: 0 } } as Record<
    MessageGroup,
    { total: number; unchecked: number }
  >;
  for (const r of rows) {
    out[groupOfKind(r.kind)].total += r.total;
    out[groupOfKind(r.kind)].unchecked += r.unchecked;
  }
  return out;
}

/** Có phản hồi, one group: the customers whose latest reply answers one of
    its messages, unchecked first, then the latest reply. */
export async function listReplies(group: MessageGroup, f: Filters): Promise<Paged<ReplyRow>> {
  const w = leadWhere(f, "last_reply_at");
  w.sql.push("l.replied is true", "l.last_reply_at is not null");
  w.params.push(MESSAGE_GROUPS[group].kinds);
  w.sql.push(`${REPLY_TO} = any($${w.params.length}::text[])`);
  if (f.check === "0") w.sql.push(UNCHECKED);
  if (f.check === "1") w.sql.push(`not ${UNCHECKED}`);
  const where = `where ${w.sql.join(" and ")}`;
  const p = await db();
  const count = await p.query<{ n: number }>(`select count(*)::int as n from upsell_leads l ${where}`, w.params);
  const total = count.rows[0].n;
  const pg = paging(total, f.page);
  const { rows } = await p.query(
    `${LEAD_SELECT.replace("select l.*,", `select l.*, ${REPLY_TO} as reply_to_kind,`)} ${where}
      order by ${UNCHECKED} desc, l.last_reply_at desc limit ${PAGE_SIZE} offset ${pg.offset}`,
    w.params,
  );
  return { rows: rows.map((r) => ({ ...shapeLead(r), reply_to_kind: String(r.reply_to_kind) })), total, page: pg.page, pages: pg.pages };
}

/** Per group: how many were sent, and how many of those the customer read. */
export async function sentByGroup(): Promise<Record<MessageGroup, { sent: number; read: number }>> {
  const p = await db();
  const { rows } = await p.query<{ kind: string; sent: number; read: number }>(
    `select m.kind, count(*)::int as sent, count(*) filter (where l.message_read)::int as read
       from upsell_messages m join upsell_leads l on l.lead_id = m.lead_id
      where m.status = 'sent' group by m.kind`,
  );
  const out = { build: { sent: 0, read: 0 }, viewed: { sent: 0, read: 0 }, downloaded: { sent: 0, read: 0 } } as Record<MessageGroup, { sent: number; read: number }>;
  for (const r of rows)
    for (const [g, def] of Object.entries(MESSAGE_GROUPS))
      if ((def.kinds as readonly string[]).includes(r.kind)) {
        out[g as MessageGroup].sent += r.sent;
        out[g as MessageGroup].read += r.read;
      }
  return out;
}

/** One kind's messages, every status (kept for tests and scripts). */
export async function listAutoMessages(kind: AutoKind, limit = 100): Promise<AutoMessageRow[]> {
  return listMessagesOfKinds([kind], ["pending_review", "approved", "sent", "failed", "rejected"], limit);
}

/** Messages waiting for review, per group — the numbers on the three buttons. */
export async function pendingByGroup(): Promise<Record<MessageGroup, number>> {
  const p = await db();
  const { rows } = await p.query<{ kind: string; n: number }>(
    "select kind, count(*) as n from upsell_messages where status = 'pending_review' group by kind",
  );
  const out = { build: 0, viewed: 0, downloaded: 0 } as Record<MessageGroup, number>;
  for (const r of rows)
    for (const [g, def] of Object.entries(MESSAGE_GROUPS))
      if ((def.kinds as readonly string[]).includes(r.kind)) out[g as MessageGroup] += r.n;
  return out;
}

export async function listInstallsPage(f: Filters): Promise<Paged<InstallRow & { lead_id: string | null }>> {
  const w = leadWhere({ ...f, pic: undefined }, "installed_at", "i");
  /* Installs have no lead_id / pic; the search reads what they do have. */
  w.sql = w.sql.map((s) => s.replace(/ or i\.lead_id ilike \$\d+/, ""));
  const where = w.sql.length ? `where ${w.sql.join(" and ")}` : "";
  const p = await db();
  const count = await p.query<{ n: number }>(`select count(*) as n from upsell_installs i ${where}`, w.params);
  const total = count.rows[0].n;
  const pg = paging(total, f.page);
  const { rows } = await p.query(
    `select i.*, l.lead_id from upsell_installs i left join upsell_leads l on l.store_domain = i.store_domain
      ${where} order by i.installed_at desc nulls last limit ${PAGE_SIZE} offset ${pg.offset}`,
    w.params,
  );
  return { rows: rows.map((r) => ({ ...r, lead_score: r.lead_score === null ? null : Number(r.lead_score) })), total, page: pg.page, pages: pg.pages };
}

export async function filterOptions(): Promise<{ pics: string[]; categories: string[] }> {
  const p = await db();
  const [pics, cats] = await Promise.all([
    p.query<{ pic: string }>("select distinct pic from upsell_leads where coalesce(pic,'') <> '' order by pic"),
    p.query<{ c: string }>(
      `select trim(split_part(category_hint, ',', 1)) as c from upsell_leads
        where coalesce(category_hint,'') <> '' group by 1 order by count(*) desc limit 40`,
    ),
  ]);
  return { pics: pics.rows.map((r) => r.pic), categories: cats.rows.map((r) => r.c).filter(Boolean) };
}

export async function tabCounts(): Promise<Record<string, number>> {
  const p = await db();
  const { rows } = await p.query<Record<string, number>>(
    `select
       (select count(*) from upsell_leads where status = 'pending_review') as pages,
       (select count(*) from upsell_messages where status = 'pending_review') as messages,
       (select count(*) from upsell_messages m join upsell_leads l on l.lead_id = m.lead_id where m.status = 'approved') as waiting,
       (select count(*) from upsell_messages where status = 'failed') as failed,
       (select count(*) from upsell_leads where status in ('sent','viewed','downloaded','used','upgraded')) as tracking,
       (select count(*) from upsell_leads where upgraded is true) as upgraded,
       (select count(*) from upsell_leads where replied is true
          and (reply_checked_at is null or reply_checked_at < last_reply_at)) as replied,
       (select count(*) from upsell_leads where status in ('new','building','rebuild_requested')) as queue,
       (select count(*) from upsell_leads where status = 'control') as control,
       (select count(*) from upsell_leads where status in ('rejected','error','skipped','uninstalled')) as closed,
       (select count(*) from upsell_installs) as installs`,
  );
  return rows[0];
}

/* ---- one lead ------------------------------------------------------------- */

export type LeadDetail = {
  lead: LeadListRow;
  design: DesignView | null;
  messages: MessageRow[];
  events: EventRow[];
  install: InstallRow | null;
};

export async function leadDetail(leadId: string): Promise<LeadDetail | null> {
  const p = await db();
  const { rows } = await p.query(`${LEAD_SELECT} where l.lead_id = $1`, [leadId]);
  if (!rows[0]) return null;
  const lead = shapeLead(rows[0]);
  const [design, messages, events, install] = await Promise.all([
    getDesignForLead(leadId),
    p.query<MessageRow>("select * from upsell_messages where lead_id = $1 order by created_at", [leadId]),
    p.query<EventRow>("select * from upsell_events where lead_id = $1 order by created_at desc, id desc limit 500", [leadId]),
    p.query<InstallRow>("select * from upsell_installs where store_domain = $1", [lead.store_domain]),
  ]);
  return { lead, design, messages: messages.rows, events: events.rows, install: install.rows[0] ?? null };
}

/* ---- statistics ----------------------------------------------------------- */

export type GroupRates = { leads: number; upgraded: number; rate: number };
export type Breakdown = { key: string; leads: number; sent: number; viewed: number; downloaded: number; upgraded: number; mrr: number };

export type UpsellStats = {
  funnel: { label: string; value: number }[];
  test: GroupRates;
  testSent: GroupRates;
  control: GroupRates;
  liftPoints: number;
  mrr: number;
  firstPassApproved: number;
  approvedAfterRebuild: number;
  byCategory: Breakdown[];
  byPageType: Breakdown[];
  byPic: Breakdown[];
  weekly: { week: string; leads: number; sent: number; upgraded: number }[];
  failuresByReason: FailureReason[];
};

/** Send failures grouped by the script's error text: every report counts,
    `messages` is how many different messages, `open` how many still sit on
    Lỗi gửi. Dated by the failure, within the filter's from/to. */
export type FailureReason = { reason: string; failures: number; messages: number; open: number };

const REACHED: Record<string, readonly string[]> = {
  sent: ["sent", "viewed", "downloaded", "used", "upgraded"],
  viewed: ["viewed", "downloaded", "used", "upgraded"],
  downloaded: ["downloaded", "used", "upgraded"],
};

export async function upsellStats(f: Filters): Promise<UpsellStats> {
  const p = await db();
  const w = leadWhere(f, "created_at");
  const where = w.sql.length ? `where ${w.sql.join(" and ")}` : "";
  const { rows } = await p.query(`${LEAD_SELECT} ${where}`, w.params);
  const leads = rows.map(shapeLead);
  const iw = leadWhere({ from: f.from, to: f.to }, "installed_at", "i");
  const installs = (await p.query<{ n: number }>(`select count(*) as n from upsell_installs i ${iw.sql.length ? `where ${iw.sql.join(" and ")}` : ""}`, iw.params)).rows[0].n;

  const test = leads.filter((l) => l.group === "test");
  const control = leads.filter((l) => l.group === "control");
  /* "Sent" is measured by the send having happened, not by the current status:
     an uninstalled lead that was sent still counts as sent. */
  const wasSent = (l: LeadListRow) => Boolean(l.sent_at);
  const viewed = (l: LeadListRow) => l.unique_views > 0 || REACHED.viewed.includes(l.status);
  const downloaded = (l: LeadListRow) => l.downloads > 0 || REACHED.downloaded.includes(l.status);
  /* TEMPORARY: "Đã dùng" is the upgraded count until a real check of page use
     exists. The old rule (pages count up after a download) also counted
     stores that only made pages of their own. */
  const used = (l: LeadListRow) => l.upgraded === true;
  const built = (l: LeadListRow) => Boolean(l.built_at);
  /* Approved = an admin let it through: reviewed, and not sitting in (or sent
     back to) the build or review steps, nor rejected. */
  const approved = (l: LeadListRow) =>
    Boolean(l.reviewed_at) && !["new", "building", "pending_review", "rebuild_requested", "rejected"].includes(l.status);

  const rate = (xs: LeadListRow[]): GroupRates => {
    const up = xs.filter((l) => l.upgraded).length;
    return { leads: xs.length, upgraded: up, rate: xs.length ? up / xs.length : 0 };
  };
  /* Intent to treat: every test lead against every control lead, sent or not —
     the honest comparison, since rejection is part of what the program does.
     Among-sent is shown beside it. */
  const t = rate(test);
  const ts = rate(test.filter(wasSent));
  const c = rate(control);

  const breakdown = (key: (l: LeadListRow) => string[]): Breakdown[] => {
    const m = new Map<string, Breakdown>();
    for (const l of test) {
      for (const k of key(l)) {
        const b = m.get(k) ?? { key: k, leads: 0, sent: 0, viewed: 0, downloaded: 0, upgraded: 0, mrr: 0 };
        b.leads++;
        if (wasSent(l)) b.sent++;
        if (viewed(l)) b.viewed++;
        if (downloaded(l)) b.downloaded++;
        if (l.upgraded) {
          b.upgraded++;
          b.mrr += Number(l.mrr_added ?? 0);
        }
        m.set(k, b);
      }
    }
    return [...m.values()].sort((a, b) => b.leads - a.leads).slice(0, 15);
  };

  const weekKey = (iso: string) => {
    const d = new Date(iso);
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day);
    return d.toISOString().slice(0, 10);
  };
  const weeks = new Map<string, { week: string; leads: number; sent: number; upgraded: number }>();
  const bump = (iso: string | null, field: "leads" | "sent" | "upgraded") => {
    if (!iso) return;
    const k = weekKey(iso);
    const w2 = weeks.get(k) ?? { week: k, leads: 0, sent: 0, upgraded: 0 };
    w2[field]++;
    weeks.set(k, w2);
  };
  for (const l of leads) {
    bump(l.created_at, "leads");
    if (l.group === "test") bump(l.sent_at, "sent");
    if (l.upgraded) bump(l.upgraded_at, "upgraded");
  }

  const approvedTest = test.filter(approved);
  const fw = leadWhere({ from: f.from, to: f.to }, "created_at", "e");
  const failures = await p.query<FailureReason>(
    `select coalesce(nullif(e.detail->>'error', ''), '(không rõ)') as reason,
            count(*) as failures,
            count(distinct e.detail->>'message_id') as messages,
            count(distinct case when m.status = 'failed' then m.id end) as open
       from upsell_events e
       left join upsell_messages m on m.id = e.detail->>'message_id'
      where e.type = 'message_failed' ${fw.sql.length ? `and ${fw.sql.join(" and ")}` : ""}
      group by 1 order by 2 desc, 1 limit 20`,
    fw.params,
  );
  return {
    funnel: [
      { label: "Store mới cài", value: installs },
      { label: "Lead", value: leads.length },
      { label: "Đã build", value: test.filter(built).length },
      { label: "Đã duyệt", value: approvedTest.length },
      { label: "Đã gửi", value: test.filter(wasSent).length },
      { label: "Đã xem", value: test.filter(viewed).length },
      { label: "Đã tải", value: test.filter(downloaded).length },
      { label: "Đã dùng", value: test.filter(used).length },
      { label: "Nâng cấp", value: test.filter((l) => l.upgraded).length },
    ],
    test: t,
    testSent: ts,
    control: c,
    liftPoints: (t.rate - c.rate) * 100,
    mrr: leads.reduce((s, l) => s + (l.upgraded ? Number(l.mrr_added ?? 0) : 0), 0),
    firstPassApproved: approvedTest.filter((l) => l.rebuild_count === 0).length,
    approvedAfterRebuild: approvedTest.filter((l) => l.rebuild_count > 0).length,
    byCategory: breakdown((l) => [(l.category_hint ?? "").split(",")[0].trim() || "(không rõ)"]),
    byPageType: breakdown((l) => [l.page1_type, l.page2_type].filter((x): x is string => Boolean(x))),
    byPic: breakdown((l) => [l.pic || "(chưa có)"]),
    weekly: [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-16),
    failuresByReason: failures.rows,
  };
}
