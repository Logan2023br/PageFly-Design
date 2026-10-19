import "server-only";

import { Pool } from "pg";
import { databaseUrl } from "@/lib/db";

/* ==========================================================================
   Claude Review — the state of the automated review run, one row.

   The admin's "Claude Review" button asks for a run (status "requested"); a
   scheduled Claude task polls this row, works through the sets one by one and
   writes its progress back here with the collections key. The admin panel only
   reads it. One JSON row is enough: there is never more than one run.

   POSTGRES ONLY, its own small pool, like Upsell — without a database the
   panel says so and the API answers 503.
   ========================================================================== */

export type ClaudeReviewItem = {
  slug: string;
  name: string;
  /** "done" reviewed and shipped, "reimport" fixed after the real render — import again to confirm, "skipped", "failed" */
  result: "done" | "reimport" | "skipped" | "failed";
  note?: string;
  finishedAt: string;
  secs?: number;
  folder?: string;
};

export type ClaudeReviewState = {
  status: "idle" | "requested" | "running" | "stopping" | "stopped" | "finished";
  requestedAt: string | null;
  requestedBy: string | null;
  startedAt: string | null;
  /** the runner touches this every step; a stale heartbeat while "running" means the run died */
  heartbeatAt: string | null;
  current: { slug: string; name: string; step: string; startedAt: string } | null;
  /** slugs still to do, in order (the first is next) */
  queue: { slug: string; name: string }[];
  done: ClaudeReviewItem[];
  /** mean seconds per finished set, for the ETA */
  avgSecs: number | null;
  message: string | null;
  /** every error the runner met, newest last (kept to the last 200) */
  errors: ClaudeReviewError[];
};

export type ClaudeReviewError = {
  at: string;
  /** the set it happened on, or null for the run itself */
  slug: string | null;
  name: string | null;
  /** the stage, e.g. "pipeline", "real render", "upload", "save to Mac" */
  step: string;
  message: string;
};

export const EMPTY_STATE: ClaudeReviewState = {
  status: "idle",
  requestedAt: null,
  requestedBy: null,
  startedAt: null,
  heartbeatAt: null,
  current: null,
  queue: [],
  done: [],
  avgSecs: null,
  message: null,
  errors: [],
};

let pool: Pool | null = null;
let ensured: Promise<unknown> | null = null;

export class ClaudeReviewFailure extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function db(): Pool {
  const url = databaseUrl();
  if (!url) throw new ClaudeReviewFailure("Claude Review needs Postgres — set DATABASE_URL.", 503);
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 10_000,
    });
  }
  ensured ??= pool.query(`create table if not exists claude_review_state (
    id integer primary key default 1 check (id = 1),
    state jsonb not null,
    updated_at timestamptz not null default now()
  )`);
  return pool;
}

export async function readState(): Promise<ClaudeReviewState> {
  const p = db();
  await ensured;
  const r = await p.query<{ state: ClaudeReviewState }>("select state from claude_review_state where id = 1");
  return { ...EMPTY_STATE, ...(r.rows[0]?.state ?? {}) };
}

async function writeState(s: ClaudeReviewState): Promise<ClaudeReviewState> {
  const p = db();
  await ensured;
  await p.query(
    `insert into claude_review_state (id, state, updated_at) values (1, $1, now())
     on conflict (id) do update set state = excluded.state, updated_at = now()`,
    [JSON.stringify(s)],
  );
  return s;
}

/** The admin's buttons. */
export async function adminAct(action: "start" | "stop", who: string | null): Promise<ClaudeReviewState> {
  const s = await readState();
  const now = new Date().toISOString();
  if (action === "start") {
    if (s.status === "running" || s.status === "requested") return s;
    return writeState({ ...s, status: "requested", requestedAt: now, requestedBy: who, message: null });
  }
  if (s.status === "requested") return writeState({ ...s, status: "idle", message: "Cancelled before it started." });
  if (s.status === "running") return writeState({ ...s, status: "stopping" });
  return s;
}

/** The runner's write: a shallow merge of the fields it sends. */
export async function runnerPatch(patch: Partial<ClaudeReviewState>): Promise<ClaudeReviewState> {
  const s = await readState();
  const next: ClaudeReviewState = { ...s, ...patch, heartbeatAt: new Date().toISOString() };
  next.errors = (next.errors ?? []).slice(-200);
  /* A stop pressed while the runner was busy survives the runner's own "running". */
  if (s.status === "stopping" && patch.status === "running") next.status = "stopping";
  return writeState(next);
}
