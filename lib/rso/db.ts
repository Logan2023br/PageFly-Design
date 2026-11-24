import "server-only";

import type { Pool, PoolClient } from "pg";
import { db as upsellDb, hasUpsellDatabase } from "@/lib/upsell/db";

/* ==========================================================================
   Radar Sold Out — the Radar's "Tell them a product is out of stock" (AC2 →
   Help) turned into a heads-up on Crisp, then a review request once the
   store restocks.

     rso_targets   one per store per round (a store comes back only after
                   cooldown_days): the pages and products out of stock, the
                   message, what the customer said, whether it restocked,
                   the review request and the review
     rso_events    what happened to a target, for its timeline
     rso_state     the jobs' clocks
     rso_settings  the screen's settings (Crisp and AC2 credentials are
                   Store set upsell's connections: N8N_AC2_URL + N8N_AC2_KEY)

   Same database and pool as the other upsells.
   ========================================================================== */

export { hasUpsellDatabase as hasRsoDatabase };

const SCHEMA = `
create table if not exists rso_targets (
  id                bigserial primary key,
  store_domain      text not null,
  store_name        text,
  email             text,
  pf_plan           text,
  pf_price          numeric,
  pages             jsonb not null default '[]'::jsonb,
  visits            int not null default 0,
  radar_group       text,
  reviewed_before   boolean not null default false,
  session_id        text,
  ticket_link       text,
  status            text not null,
  skip_code         text,
  skip_reason       text,
  message           text,
  error             text,
  approved_by       text,
  sent_at           timestamptz,
  sent_by           text,
  stage             text,
  read_at           timestamptz,
  replied_at        timestamptz,
  last_reply_at     timestamptz,
  last_reply_text   text,
  replies           int not null default 0,
  reply_intent      text,
  mood              text,
  mood_note         text,
  checked_at        timestamptz,
  restocked_at      timestamptz,
  review_status     text,
  review_message    text,
  review_asked_at   timestamptz,
  review_asked_by   text,
  review_error      text,
  app_review        int,
  reviewed_at       timestamptz,
  tracked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table rso_targets add column if not exists reply_seen_at timestamptz;
alter table rso_targets add column if not exists mentioned_at timestamptz;
create index if not exists rso_targets_domain on rso_targets (store_domain, created_at desc);
create index if not exists rso_targets_status on rso_targets (status, created_at desc);
create index if not exists rso_targets_sent on rso_targets (sent_at desc);

create table if not exists rso_events (
  id          bigserial primary key,
  target_id   bigint not null,
  type        text not null,
  actor       text not null,
  detail      jsonb,
  at          timestamptz not null default now()
);
create index if not exists rso_events_target on rso_events (target_id, at desc);

create table if not exists rso_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists rso_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
/* once, 2026-11-24: stores with few visits are sent too — a saved threshold
   goes to 0, and the stores left out for it go back to the next scan */
do $$
begin
  if not exists (select 1 from rso_state where key = '_once_low_visits_0_20261124') then
    insert into rso_state (key, value) values ('_once_low_visits_0_20261124', 'true'::jsonb);
    update rso_settings set value = '0'::jsonb, updated_at = now() where key = 'min_visits';
    delete from rso_events where target_id in (select id from rso_targets where status = 'skipped' and skip_code = 'low_visits');
    delete from rso_targets where status = 'skipped' and skip_code = 'low_visits';
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

export async function logEvent(c: Db, targetId: number | string, type: string, actor: string, detail?: Record<string, unknown> | null): Promise<void> {
  await c.query("insert into rso_events (target_id, type, actor, detail) values ($1, $2, $3, $4)", [
    targetId,
    type,
    actor,
    detail ? JSON.stringify(detail) : null,
  ]);
}

export async function getState<T>(key: string): Promise<T | null> {
  const { rows } = await (await db()).query<{ value: T }>("select value from rso_state where key = $1", [key]);
  return rows[0]?.value ?? null;
}

export async function setState(key: string, value: unknown): Promise<void> {
  await (await db()).query(
    `insert into rso_state (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}
