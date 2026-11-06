import "server-only";

import type { Pool, PoolClient } from "pg";
import { db as upsellDb, hasUpsellDatabase } from "@/lib/upsell/db";

/* ==========================================================================
   Upsell Collection Pages 2 — the Collection Pages invite that another flow
   sends on Crisp and records in the "User Testing" tab of the Pagefly Design
   sheet. This side reads nothing from Google: n8n posts the sheet's rows in
   and reads each row's outcome back into the sheet's PFD columns.

     ucp2_rows    one row per sheet row, keyed by its Crisp session — what
                  was sent, and what the customer did after
     ucp2_events  what happened (clicked, read, replied…), for the timeline
                  and the click counts
     ucp2_state   internal clocks (`tracked`, `imported`, `pulled`)

   Same database and pool as Upsell Build Pages and Store set upsell.
   ========================================================================== */

export { hasUpsellDatabase as hasUcp2Database };

const SCHEMA = `
create table if not exists ucp2_rows (
  session_id        text primary key,
  sent_at           timestamptz not null,
  code              text,
  store_domain      text not null,
  email             text,
  store_name        text,
  plan              text,
  type_user         text,
  ticket_link       text,
  imported_at       timestamptz not null default now(),
  -- what AC2 said when the row came in
  pf_plan           text,
  pf_price          numeric,
  app_status        text,
  -- what the customer did
  delivered_at      timestamptz,
  read_at           timestamptz,
  clicked_at        timestamptz,
  clicks            int not null default 0,
  downloaded_at     timestamptz,
  replied_at        timestamptz,
  last_reply_at     timestamptz,
  last_reply_text   text,
  replies           int not null default 0,
  upgraded_at       timestamptz,
  upgraded_to       text,
  upgraded_price    numeric,
  reviewed_at       timestamptz,
  app_review        int,
  -- 5★ already when first looked at, within a day of the message: not ours
  reviewed_before   boolean not null default false,
  uninstalled_at    timestamptz,
  -- bookkeeping
  crisp_checked_at  timestamptz,
  review_checked_at timestamptz,
  ac2_checked_at    timestamptz,
  tracked_at        timestamptz,
  changed_at        timestamptz not null default now()
);
-- AC2's price at the first look, and when: an upgrade without AC2's charge
-- time is believed only from a first look made the day the message went
alter table ucp2_rows add column if not exists first_price numeric;
alter table ucp2_rows add column if not exists first_ac2_at timestamptz;
create index if not exists ucp2_rows_sent on ucp2_rows (sent_at desc);
create index if not exists ucp2_rows_domain on ucp2_rows (store_domain);
create index if not exists ucp2_rows_code on ucp2_rows (lower(code));
create index if not exists ucp2_rows_changed on ucp2_rows (changed_at);

create table if not exists ucp2_events (
  id          bigserial primary key,
  session_id  text not null,
  type        text not null,
  actor       text not null,
  detail      jsonb,
  at          timestamptz not null default now()
);
create index if not exists ucp2_events_row on ucp2_events (session_id, at desc);

create table if not exists ucp2_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
/* Once, on 2026-11-06: the first pass counted as upgraded every store paid
   now that the sheet called Free — most had paid long before the message.
   Forgotten, and looked at again under the stricter rule. */
do $$
begin
  if not exists (select 1 from ucp2_state where key = '_once_upgrades_20261106') then
    insert into ucp2_state (key, value) values ('_once_upgrades_20261106', 'true'::jsonb);
    update ucp2_rows set upgraded_at = null, upgraded_to = null, upgraded_price = null, ac2_checked_at = null, changed_at = now()
     where upgraded_at is not null;
    delete from ucp2_events where type = 'upgraded';
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

export async function logEvent(c: Db, sessionId: string, type: string, actor: string, detail?: Record<string, unknown> | null): Promise<void> {
  await c.query("insert into ucp2_events (session_id, type, actor, detail) values ($1, $2, $3, $4)", [
    sessionId,
    type,
    actor,
    detail ? JSON.stringify(detail) : null,
  ]);
}

export async function getState<T>(key: string): Promise<T | null> {
  const { rows } = await (await db()).query<{ value: T }>("select value from ucp2_state where key = $1", [key]);
  return rows[0]?.value ?? null;
}

export async function setState(key: string, value: unknown): Promise<void> {
  await (await db()).query(
    `insert into ucp2_state (key, value) values ($1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

/** For tests: forget the schema check so a fresh database gets it again. */
export function resetUcp2Schema(): void {
  ensured = null;
}
