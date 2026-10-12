import "server-only";

import { Pool, types, type PoolClient } from "pg";
import { databaseUrl } from "@/lib/db";
import { UpsellError } from "./types";

/* ==========================================================================
   Upsell's own pool, against the same database as everything else.

   POSTGRES ONLY. The rest of the app also runs on a JSON file, and this module
   deliberately does not: its state machine leans on row locks and partial
   unique indexes, and a second implementation of every rule would be a second
   place for "sync never overwrites a review decision" to quietly stop being
   true. Without a database the admin screen says so and the API answers 503.

   ITS OWN POOL, NOT THE REPO'S, so the type parsers below cannot change what
   any existing query gets back. `pg.types` is global; a pool's `types` is not.
   ========================================================================== */

/* Timestamps as ISO 8601 UTC strings, numerics and counts as numbers — the
   API speaks JSON, and a Date or a "12.50" string would leak straight into it. */
const parsers: Record<number, (v: string) => unknown> = {
  1184: (v) => new Date(v).toISOString(), // timestamptz
  1114: (v) => new Date(`${v}Z`).toISOString(), // timestamp
  1700: (v) => Number(v), // numeric
  20: (v) => Number(v), // int8 (count(*))
};
const typeOverrides = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    parsers[oid] ?? types.getTypeParser(oid, format ?? "text")) as typeof types.getTypeParser,
};

let pool: Pool | null = null;
let ensured: Promise<void> | null = null;

export function hasUpsellDatabase(): boolean {
  return databaseUrl() !== null;
}

function getPool(): Pool {
  const url = databaseUrl();
  if (!url) throw new UpsellError("Upsell Build Pages needs Postgres — set DATABASE_URL.", 503);
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 10_000,
      types: typeOverrides,
    });
  }
  return pool;
}

const SCHEMA = `
create table if not exists upsell_installs (
  store_domain      text primary key,
  installed_at      timestamptz,
  store_name        text,
  email             text,
  phone             text,
  country           text,
  timezone          text,
  shopify_plan      text,
  pf_plan           text,
  app_status        text,
  onboarding_intent text,
  storefront        text,
  product_count     text,
  category_hint     text,
  email_type        text,
  lead_score        numeric,
  score_reasons     text,
  lead              boolean not null default false,
  skip_reason       text,
  rechecked         boolean not null default false,
  synced_at         timestamptz
);
create index if not exists upsell_installs_installed on upsell_installs (installed_at desc);

create table if not exists upsell_leads (
  lead_id            text primary key,
  store_domain       text not null,
  store_name         text,
  email              text,
  phone              text,
  country            text,
  timezone           text,
  shopify_plan       text,
  lead_score         numeric,
  score_reasons      text,
  category_hint      text,
  onboarding_intent  text,
  product_count      text,
  "group"            text not null default 'test',
  status             text not null default 'new',
  pic                text,
  priority           text not null default 'normal',
  error              text,
  build_started_at   timestamptz,
  built_at           timestamptz,
  page1_type         text,
  page2_type         text,
  rebuild_note       text,
  rebuild_page_types text[],
  rebuild_count      int not null default 0,
  build_note         text,
  build_timeouts     int not null default 0,
  reviewed_by        text,
  reviewed_at        timestamptz,
  review_note        text,
  reject_reason      text,
  sent_at            timestamptz,
  crisp_session      text,
  ticket_link        text,
  plan_at_send       text,
  price_at_send      numeric,
  pages_at_send      int,
  published_at_send  int,
  message_read       boolean,
  replied            boolean,
  last_reply_at      timestamptz,
  last_reply_text    text,
  sentiment          text,
  feedback_summary   text,
  wants_changes      boolean,
  followup1_at       timestamptz,
  followup2_at       timestamptz,
  review_asked_at    timestamptz,
  reviewed_app       boolean,
  current_plan       text,
  current_price      numeric,
  pages_now          int,
  published_now      int,
  used_page          boolean,
  upgraded           boolean,
  upgraded_at        timestamptz,
  upgraded_to        text,
  mrr_added          numeric,
  app_status         text,
  uninstalled_at     timestamptz,
  internal_notes     text,
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists upsell_leads_domain on upsell_leads (store_domain);
create index if not exists upsell_leads_status on upsell_leads (status, created_at);

create table if not exists upsell_designs (
  id              text primary key,
  lead_id         text not null unique references upsell_leads (lead_id) on delete cascade,
  version         int not null default 1,
  category        text,
  language        text,
  expires_at      timestamptz,
  files_purged_at timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists upsell_pages (
  design_id    text not null references upsell_designs (id) on delete cascade,
  version      int not null,
  slot         int not null check (slot in (1, 2)),
  type         text not null,
  title        text,
  html_path    text,
  pagefly_path text,
  thumb_path   text,
  size_bytes   bigint,
  created_at   timestamptz not null default now(),
  primary key (design_id, version, slot)
);

create table if not exists upsell_messages (
  id          text primary key,
  lead_id     text not null references upsell_leads (lead_id) on delete cascade,
  kind        text not null,
  content     text not null,
  status      text not null default 'pending_review',
  send_mode   text not null default 'window',
  created_by  text not null,
  approved_by text,
  approved_at timestamptz,
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz not null default now()
);
/* One of each kind per lead — except custom, which an admin writes as often as
   a conversation needs. Enforced here so two overlapping script runs cannot
   both draft the same follow-up. */
create unique index if not exists upsell_messages_one_per_kind
  on upsell_messages (lead_id, kind) where kind <> 'custom';
create index if not exists upsell_messages_status on upsell_messages (status, created_at);

create table if not exists upsell_events (
  id         bigserial primary key,
  lead_id    text,
  design_id  text,
  type       text not null,
  actor      text not null,
  page_slot  int,
  rating     int,
  comment    text,
  detail     jsonb,
  visitor_id text,
  ip_hash    text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists upsell_events_lead on upsell_events (lead_id, created_at);
create index if not exists upsell_events_design on upsell_events (design_id, type);
create index if not exists upsell_events_created on upsell_events (created_at desc);

create table if not exists upsell_settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);
`;

async function ensureSchema(p: Pool): Promise<void> {
  /* Once per process. Concurrent first requests share the one promise, and a
     failure clears it so the next request tries again rather than every
     request failing for the life of the process. */
  if (!ensured) {
    ensured = p.query(SCHEMA).then(
      () => undefined,
      (err) => {
        ensured = null;
        throw err;
      },
    );
  }
  return ensured;
}

export type Db = Pick<PoolClient, "query">;

export async function db(): Promise<Pool> {
  const p = getPool();
  await ensureSchema(p);
  return p;
}

/** Run `fn` in one transaction. Every state change goes through here, so a
    status and the event recording it are written together or not at all. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const p = await db();
  const c = await p.connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (err) {
    await c.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

/** For tests: drop the pool so the next call reconnects with fresh env. */
export async function closeUpsellPool(): Promise<void> {
  const p = pool;
  pool = null;
  ensured = null;
  await p?.end();
}
