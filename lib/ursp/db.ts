import "server-only";

import type { Pool, PoolClient } from "pg";
import { db as upsellDb, hasUpsellDatabase } from "@/lib/upsell/db";

/* ==========================================================================
   Upsell Responsive — Logan offers BFMC customers a free review of every
   page's responsive layout, and free fixes, until the end of November.

     ursp_recap_rows  every row of the support Recap sheet read since the
                      campaign started: its category, resolution, and
                      whether it became a target (rows from before are
                      never read)
     ursp_categories  category_issue → responsive or not, as Haiku said
                      (once per distinct spelling)
     ursp_targets     one per store and segment — recap (a support ticket
                      about responsive) or active (a store active today that
                      has not talked to support): why it was skipped, or the
                      message, what the customer did, and what came of it
     ursp_events      what happened to a target, for its timeline
     ursp_state       the jobs' clocks and cursors
     ursp_settings    the screen's settings (credentials are Store set
                      upsell's: same Crisp, same AC2)

   Same database and pool as the other upsells.
   ========================================================================== */

export { hasUpsellDatabase as hasUrspDatabase };

const SCHEMA = `
create table if not exists ursp_recap_rows (
  row_key          text primary key,
  sheet_row        int,
  recap_at         timestamptz,
  store_domain     text,
  session_id       text,
  ticket_url       text,
  category_issue   text,
  resolution       text,
  issue_summary    text,
  pic              text,
  shopify_plan     text,
  pages_published  int,
  responsive       boolean,
  target_id        bigint,
  seen_at          timestamptz not null default now()
);
create index if not exists ursp_recap_rows_seen on ursp_recap_rows (seen_at desc);

create table if not exists ursp_categories (
  category    text primary key,
  responsive  boolean not null,
  by          text not null,
  at          timestamptz not null default now()
);

create table if not exists ursp_targets (
  id                bigserial primary key,
  segment           text not null,
  store_domain      text not null,
  recap_key         text,
  email             text,
  store_name        text,
  country           text,
  shopify_plan      text,
  pf_plan           text,
  pf_price          numeric,
  pages_published   int,
  session_id        text,
  ticket_link       text,
  source            jsonb,
  status            text not null,
  skip_code         text,
  skip_reason       text,
  message           text,
  error             text,
  approved_by       text,
  wait_until        timestamptz,
  sent_at           timestamptz,
  sent_by           text,
  -- what the customer did
  delivered_at      timestamptz,
  read_at           timestamptz,
  replied_at        timestamptz,
  last_reply_at     timestamptz,
  last_reply_text   text,
  replies           int not null default 0,
  reply_intent      text,
  mood              text,
  mood_note         text,
  classified_at     timestamptz,
  mentioned_at      timestamptz,
  -- handled by the team
  done_at           timestamptz,
  done_by           text,
  -- what came of it
  first_price       numeric,
  first_ac2_at      timestamptz,
  first_review      int,
  upgraded_at       timestamptz,
  upgraded_to       text,
  upgraded_price    numeric,
  app_review        int,
  reviewed_at       timestamptz,
  uninstalled_at    timestamptz,
  -- bookkeeping
  crisp_checked_at  timestamptz,
  slow_checked_at   timestamptz,
  tracked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (segment, store_domain)
);
-- the reminder after a read with no reply
alter table ursp_targets add column if not exists followup_status text;
alter table ursp_targets add column if not exists followup_message text;
alter table ursp_targets add column if not exists followup_approved_by text;
alter table ursp_targets add column if not exists followup_sent_at timestamptz;
alter table ursp_targets add column if not exists followup_error text;
create index if not exists ursp_targets_status on ursp_targets (status, created_at desc);
create index if not exists ursp_targets_domain on ursp_targets (store_domain);
create index if not exists ursp_targets_sent on ursp_targets (sent_at desc);

create table if not exists ursp_events (
  id          bigserial primary key,
  target_id   bigint not null,
  type        text not null,
  actor       text not null,
  detail      jsonb,
  at          timestamptz not null default now()
);
create index if not exists ursp_events_target on ursp_events (target_id, at desc);

create table if not exists ursp_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists ursp_settings (
  key        text primary key,
  value      jsonb not null,
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

export async function logEvent(c: Db, targetId: number | string, type: string, actor: string, detail?: Record<string, unknown> | null): Promise<void> {
  await c.query("insert into ursp_events (target_id, type, actor, detail) values ($1, $2, $3, $4)", [
    targetId,
    type,
    actor,
    detail ? JSON.stringify(detail) : null,
  ]);
}

export async function getState<T>(key: string): Promise<T | null> {
  const { rows } = await (await db()).query<{ value: T }>("select value from ursp_state where key = $1", [key]);
  return rows[0]?.value ?? null;
}

export async function setState(key: string, value: unknown): Promise<void> {
  await (await db()).query(
    `insert into ursp_state (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

/** For tests: forget the schema check so a fresh database gets it again. */
export function resetUrspSchema(): void {
  ensured = null;
}
