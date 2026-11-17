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
  /** Tắt: the admin turned Claude Review off — no firing does anything until it is turned on again */
  disabled: { at: string; by: string | null } | null;
  /** sets the admin paused: left in the queue, never picked, until resumed */
  paused: string[];
  /** the sets the admin picked for this run — null: every set nobody has reviewed */
  selected: string[] | null;
  /** every set finished by earlier runs, oldest first (the last 1000): when, which, what came of it */
  history: ClaudeReviewItem[];
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
  disabled: null,
  paused: [],
  selected: null,
  history: [],
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
  const raw = r.rows[0]?.state;
  const s: ClaudeReviewState = { ...EMPTY_STATE, ...(raw ?? {}) };
  /* Once, for the state from before the history: a run that is over goes
     into the history and the progress starts empty. */
  if (raw && !("history" in raw) && s.status !== "running" && s.status !== "requested" && s.status !== "stopping")
    return writeState(archived(s));
  return s;
}

/** The run's finished sets moved into the history; the progress empty again. */
function archived(s: ClaudeReviewState): ClaudeReviewState {
  return {
    ...s,
    history: [...(s.history ?? []), ...s.done].slice(-1000),
    done: [],
    queue: [],
    current: null,
    errors: [],
    paused: [],
    selected: null,
    startedAt: null,
    status: "idle",
    message: null,
  };
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

export type AdminAction =
  | { action: "start"; slugs?: string[] }
  | { action: "stop" | "disable" | "enable" }
  | { action: "pause" | "resume"; slug: string };

/** The admin's buttons. */
export async function adminAct(a: AdminAction, who: string | null): Promise<ClaudeReviewState> {
  const s = await readState();
  const now = new Date().toISOString();
  const action = a.action;
  /* Tắt: nothing runs — a run on the bench stops after its current set, and
     the hourly firing finds it off (runner.py begin → NOOP disabled). */
  if (action === "disable") {
    const status = s.status === "running" ? "stopping" : s.status === "requested" ? "idle" : s.status;
    return writeState({ ...s, status, disabled: { at: now, by: who }, message: "Đã tắt Claude Review — không chạy gì nữa cho tới khi bật lại." });
  }
  if (action === "enable") return writeState({ ...s, disabled: null, message: null });
  /* Tạm dừng / Tiếp tục one set: a paused set is skipped by the runner. */
  if (a.action === "pause" || a.action === "resume") {
    const paused = new Set(s.paused ?? []);
    if (a.action === "pause") paused.add(a.slug);
    else paused.delete(a.slug);
    return writeState({ ...s, paused: [...paused] });
  }
  if (action === "start") {
    if (s.disabled) throw new ClaudeReviewFailure("Claude Review đang tắt — bấm Bật lại trước.", 409);
    if (s.status === "running" || s.status === "requested") return s;
    /* A new run: the last one's results go to the history first. */
    const slugs = a.action === "start" && a.slugs?.length ? [...new Set(a.slugs)] : null;
    return writeState({ ...archived(s), avgSecs: s.avgSecs, status: "requested", requestedAt: now, requestedBy: who, selected: slugs });
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
