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
-- when the offer in the message ends (offer_days after it went); null: sent before offers lasted 3 days
alter table ursp_targets add column if not exists offer_until timestamptz;
-- A / B of an A/B test (null: before there was one); status 'held' is a B kept back, nothing sent
alter table ursp_targets add column if not exists variant text;
-- "Tiến hành xử lý": someone is on it
alter table ursp_targets add column if not exists working_at timestamptz;
alter table ursp_targets add column if not exists working_by text;
-- "Bỏ qua": the team let this one go, and said why
alter table ursp_targets add column if not exists dismissed_at timestamptz;
alter table ursp_targets add column if not exists dismissed_by text;
alter table ursp_targets add column if not exists dismiss_reason text;
-- after Đã xử lý xong: the customer confirmed it works → Logan thanks them and asks for a review, once
alter table ursp_targets add column if not exists review_ask_status text;
alter table ursp_targets add column if not exists review_asked_at timestamptz;
alter table ursp_targets add column if not exists review_asked_by text;
alter table ursp_targets add column if not exists review_ask_error text;
-- where it asked: shopify (the app's review form) | trustpilot | null (thanks only)
alter table ursp_targets add column if not exists review_ask_where text;
-- what Haiku made of the last reply after Đã xử lý xong: confirmed | more | unhappy | other
alter table ursp_targets add column if not exists after_done_read text;
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

-- the team's notes on a case, each at the stage it was written
create table if not exists ursp_notes (
  id         bigserial primary key,
  target_id  bigint not null,
  stage      text not null,
  text       text not null,
  by         text not null,
  at         timestamptz not null default now()
);
create index if not exists ursp_notes_target on ursp_notes (target_id, at);
-- team: written on the screen; customer: what they replied, summed up, added by the tracker;
-- auto: what the workflow did or held back on its own (the review request, "FL reply")
alter table ursp_notes add column if not exists kind text not null default 'team';

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
/* Once, on 2026-11-09: every store messaged before the A/B test got the A
   message — it is variant A, so the test shows what was really sent. */
do $$
begin
  if not exists (select 1 from ursp_state where key = '_once_variant_a_20261109') then
    insert into ursp_state (key, value) values ('_once_variant_a_20261109', 'true'::jsonb);
    update ursp_targets set variant = 'A' where variant is null and status in ('pending', 'approved', 'sending', 'sent', 'failed');
  end if;
end $$;
/* once: from 11-11 the program is for stores with 10 published pages or fewer (was 20) — a saved 20 follows */
do $$
begin
  if not exists (select 1 from ursp_state where key = '_once_max_pages_10_20261111') then
    insert into ursp_state (key, value) values ('_once_max_pages_10_20261111', 'true'::jsonb);
    update ursp_settings set value = '10'::jsonb where key = 'max_published_pages' and value::text in ('20', '"20"');
  end if;
end $$;
/* once: the cases cancelled into the short-lived Đã huỷ list go to Đã bỏ qua, where a cancel now leads */
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'ursp_targets' and column_name = 'cancelled_at') then
    execute $q$update ursp_targets set dismissed_at = cancelled_at, dismissed_by = cancelled_by, dismiss_reason = 'Huỷ khi đang xử lý', cancelled_at = null
               where cancelled_at is not null and dismissed_at is null and working_at is null and done_at is null$q$;
  end if;
end $$;
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
