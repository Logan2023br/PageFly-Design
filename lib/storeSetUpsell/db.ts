import "server-only";

import type { Pool, PoolClient } from "pg";
import { db as upsellDb, hasUpsellDatabase } from "@/lib/upsell/db";

/* ==========================================================================
   Store set upsell — who picked a Store set template in PageFly, and the
   thank-you / free-editing message we send them on Crisp.

   Same database and pool as Upsell Build Pages (POSTGRES ONLY, for the same
   reasons: row locks and a one-message-per-kind index), its own tables:

     ssu_selections  one row per Mixpanel `select_template` event with a
                     store_set — the raw feed, deduplicated on $insert_id
     ssu_customers   one row per store: what we know of it (Mixpanel, AC2,
                     Crisp) and where its upsell is
     ssu_messages    what we wrote it, and whether it went
     ssu_events      what happened, for the timeline on the screen
     ssu_settings    mode, templates, connections; `_` keys are internal
   ========================================================================== */

export { hasUpsellDatabase as hasStoreSetDatabase };

const SCHEMA = `
create table if not exists ssu_selections (
  id            bigserial primary key,
  insert_id     text not null unique,
  event_time    timestamptz not null,
  store_domain  text,
  email         text,
  store_set     text not null,
  template_id   text,
  template_type text,
  page_type     text,
  min_plan      text,
  is_locked     boolean,
  is_dev_store  boolean,
  source        text,
  country       text,
  region        text,
  city          text,
  browser       text,
  os            text,
  editor_version text,
  distinct_id   text,
  created_at    timestamptz not null default now()
);
create index if not exists ssu_selections_time on ssu_selections (event_time desc);
create index if not exists ssu_selections_store on ssu_selections (store_domain, event_time desc);

create table if not exists ssu_customers (
  store_domain        text primary key,
  email               text,
  store_name          text,
  phone               text,
  country             text,
  city                text,
  timezone            text,
  shopify_plan        text,
  pf_plan             text,
  pf_price            numeric,
  pages               int,
  published           int,
  app_status          text,
  installed_at        timestamptz,
  uninstalled_at      timestamptz,
  is_dev_store        boolean,
  sets                text[] not null default '{}',
  selections          int not null default 0,
  first_selected_at   timestamptz,
  last_selected_at    timestamptz,
  ac2_synced_at       timestamptz,
  crisp_checked_at    timestamptz,
  crisp_conversations int,
  crisp_sessions      jsonb,
  app_review          numeric,
  status              text not null default 'new',
  skip_reason         text,
  crisp_session       text,
  ticket_link         text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  replied             boolean not null default false,
  last_reply_at       timestamptz,
  last_reply_text     text,
  needs_check         boolean not null default false,
  checked_by          text,
  checked_at          timestamptz,
  review_asked_at     timestamptz,
  reviewed_at         timestamptz,
  price_at_send       numeric,
  pages_at_send       int,
  published_at_send   int,
  upgraded_at         timestamptz,
  upgraded_to         text,
  pages_updated_at    timestamptz,
  tracked_at          timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists ssu_customers_status on ssu_customers (status, last_selected_at desc);
create index if not exists ssu_customers_last on ssu_customers (last_selected_at desc);

create table if not exists ssu_messages (
  id           text primary key,
  store_domain text not null references ssu_customers (store_domain) on delete cascade,
  kind         text not null,
  content      text not null,
  status       text not null default 'pending_review',
  created_by   text not null,
  approved_by  text,
  approved_at  timestamptz,
  sent_at      timestamptz,
  error        text,
  attempts     int not null default 0,
  failed_at    timestamptz,
  created_at   timestamptz not null default now()
);
/* Written from the template and not edited since: written again at send time. */
alter table ssu_messages add column if not exists rerender boolean not null default false;
create unique index if not exists ssu_messages_one_per_kind on ssu_messages (store_domain, kind) where kind <> 'custom';
create index if not exists ssu_messages_status on ssu_messages (status, created_at);

create table if not exists ssu_events (
  id           bigserial primary key,
  store_domain text,
  type         text not null,
  actor        text not null,
  detail       jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists ssu_events_store on ssu_events (store_domain, created_at desc);

create table if not exists ssu_settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);
`;

let ensured: Promise<void> | null = null;

export async function db(): Promise<Pool> {
  const p = await upsellDb();
  if (!ensured) {
    ensured = p.query(SCHEMA).then(
      () => undefined,
      (err) => {
        ensured = null;
        throw err;
      },
    );
  }
  await ensured;
  return p;
}

export type Db = Pick<PoolClient, "query">;

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

export async function logEvent(
  c: Db,
  storeDomain: string | null,
  type: string,
  actor: string,
  detail?: Record<string, unknown> | null,
): Promise<void> {
  await c.query("insert into ssu_events (store_domain, type, actor, detail) values ($1, $2, $3, $4)", [
    storeDomain,
    type,
    actor,
    detail ? JSON.stringify(detail) : null,
  ]);
}

/** For tests: forget the schema check so a fresh database gets it again. */
export function resetStoreSetSchema(): void {
  ensured = null;
}
