import "server-only";

import type { Pool } from "pg";
import { db as upsellDb, hasUpsellDatabase } from "@/lib/upsell/db";

/* ==========================================================================
   Feedback New Feature — PageFly's new features (Funnel Builder, Bundles,
   Post-purchase offer) introduced to the stores whose Upsell Responsive case
   was handled (Đã xử lý / Kết thúc), asking which one they need.

     nff_targets   one per store: the message (waits on Chờ duyệt), sent,
                   read, what they replied and which feature they want
     nff_events    what happened to a target
     nff_state     the jobs' clocks
     nff_settings  the screen's settings

   Same database and pool as the other upsells.
   ========================================================================== */

export { hasUpsellDatabase as hasNffDatabase };

const SCHEMA = `
create table if not exists nff_targets (
  id               bigserial primary key,
  store_domain     text not null unique,
  store_name       text,
  email            text,
  session_id       text,
  ticket_link      text,
  ursp_id          bigint,
  ursp_stage       text,
  status           text not null default 'pending',
  message          text,
  error            text,
  approved_by      text,
  sent_at          timestamptz,
  read_at          timestamptz,
  replied_at       timestamptz,
  last_reply_at    timestamptz,
  last_reply_text  text,
  reply_seen_at    timestamptz,
  replies          int not null default 0,
  interest         text,
  mood             text,
  mood_note        text,
  mentioned_at     timestamptz,
  tracked_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists nff_targets_status on nff_targets (status, created_at desc);
-- where the store came from (Upsell Responsive, or an imported sheet) and a note (the sheet's priority)
alter table nff_targets add column if not exists source text;
alter table nff_targets add column if not exists note text;

create table if not exists nff_events (
  id          bigserial primary key,
  target_id   bigint not null,
  type        text not null,
  actor       text not null,
  detail      jsonb,
  at          timestamptz not null default now()
);
create index if not exists nff_events_target on nff_events (target_id, at desc);

create table if not exists nff_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists nff_settings (
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

export async function logEvent(targetId: number | string, type: string, actor: string, detail?: Record<string, unknown> | null): Promise<void> {
  await (await db()).query("insert into nff_events (target_id, type, actor, detail) values ($1, $2, $3, $4)", [
    targetId,
    type,
    actor,
    detail ? JSON.stringify(detail) : null,
  ]);
}

export async function getState<T>(key: string): Promise<T | null> {
  const { rows } = await (await db()).query<{ value: T }>("select value from nff_state where key = $1", [key]);
  return rows[0]?.value ?? null;
}

export async function setState(key: string, value: unknown): Promise<void> {
  await (await db()).query(
    `insert into nff_state (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}
