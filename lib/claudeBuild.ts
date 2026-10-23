import "server-only";

import { Pool, type PoolClient } from "pg";
import { databaseUrl } from "@/lib/db";

/* ==========================================================================
   Claude Build — collection page sets built by a Claude routine, on demand.

   THE ADMIN ASKS, THE ROUTINE BUILDS, THIS RECORDS.
     1. "Start build" queues N jobs (one job = one set of pages) and fires the
        routine (see fireTrigger) so it starts at once instead of at its next
        scheduled run.
     2. The routine claims a job, reports each step as it goes (which the
        panel shows as a progress line), creates the set, uploads every
        page's .html and .pagefly into PageFly Design's own tables — the same
        place every imported set lives — and finishes it.
     3. The panel polls the jobs: building, waiting, built, failed, cancelled.

   The build criteria (what to build, how the pages should look) are one text
   the admin writes on the panel; the routine reads them with each job.

   POSTGRES ONLY, its own small pool, like Claude Review and Upsell.
   ========================================================================== */

import { BUILD_STEPS, isBuildStep, type BuildJob, type BuildJobStatus, type BuildStepKey, type BuildTrigger } from "./claudeBuildShared";

export { BUILD_STEPS, isBuildStep };
export type { BuildJob, BuildJobStatus, BuildStepKey, BuildTrigger };

export class ClaudeBuildFailure extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** A running job silent this long has died (the routine was cut off). */
export const STALE_MINUTES = 30;

let pool: Pool | null = null;
let ensured: Promise<unknown> | null = null;

function db(): Pool {
  const url = databaseUrl();
  if (!url) throw new ClaudeBuildFailure("Claude Build needs Postgres — set DATABASE_URL.", 503);
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10_000,
    });
  }
  ensured ??= pool
    .query(
      `create table if not exists claude_build_jobs (
         id               text primary key,
         note             text,
         status           text not null default 'queued',
         step             text,
         detail           text,
         progress         int not null default 0,
         log              jsonb not null default '[]',
         set_id           text,
         set_slug         text,
         set_name         text,
         pages            int not null default 0,
         error            text,
         cancel_requested boolean not null default false,
         requested_by     text,
         created_at       timestamptz not null default now(),
         started_at       timestamptz,
         finished_at      timestamptz,
         heartbeat_at     timestamptz
       );
       create index if not exists claude_build_jobs_status on claude_build_jobs (status, created_at);
       create table if not exists claude_build_settings (
         key        text primary key,
         value      text,
         updated_at timestamptz not null default now()
       );`,
    )
    .catch((err) => {
      ensured = null;
      throw err;
    });
  return pool;
}

async function ready(): Promise<Pool> {
  const p = db();
  await ensured;
  return p;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);

function toJob(r: Record<string, unknown>): BuildJob {
  return {
    id: String(r.id),
    note: (r.note as string) ?? null,
    status: r.status as BuildJobStatus,
    step: isBuildStep(r.step) ? r.step : null,
    detail: (r.detail as string) ?? null,
    progress: Number(r.progress ?? 0),
    log: Array.isArray(r.log) ? (r.log as BuildJob["log"]) : [],
    setId: (r.set_id as string) ?? null,
    setSlug: (r.set_slug as string) ?? null,
    setName: (r.set_name as string) ?? null,
    pages: Number(r.pages ?? 0),
    error: (r.error as string) ?? null,
    cancelRequested: Boolean(r.cancel_requested),
    requestedBy: (r.requested_by as string) ?? null,
    createdAt: iso(r.created_at)!,
    startedAt: iso(r.started_at),
    finishedAt: iso(r.finished_at),
    heartbeatAt: iso(r.heartbeat_at),
  };
}

const newJobId = () => `cb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/* ---- reads ----------------------------------------------------------------- */

/** Every job, newest first, with a running job that went silent marked failed. */
export async function listJobs(limit = 300): Promise<BuildJob[]> {
  const p = await ready();
  await p.query(
    `update claude_build_jobs
        set status = 'failed', finished_at = now(),
            error = coalesce(error, 'The routine stopped reporting (no update for ' || $1 || ' minutes).')
      where status = 'running' and coalesce(heartbeat_at, started_at) < now() - make_interval(mins => $1)`,
    [STALE_MINUTES],
  );
  const { rows } = await p.query(`select * from claude_build_jobs order by created_at desc limit $1`, [limit]);
  return rows.map(toJob);
}

export async function readSetting(key: "criteria" | "trigger"): Promise<string | null> {
  const p = await ready();
  const { rows } = await p.query<{ value: string | null }>("select value from claude_build_settings where key = $1", [key]);
  return rows[0]?.value ?? null;
}

async function writeSetting(key: "criteria" | "trigger", value: string): Promise<void> {
  const p = await ready();
  await p.query(
    `insert into claude_build_settings (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, value],
  );
}

export async function readTrigger(): Promise<BuildTrigger> {
  const raw = await readSetting("trigger");
  const t = raw ? (JSON.parse(raw) as { at?: string; result?: string; session?: string | null }) : {};
  /* Only a claude.ai session link is shown as a link. */
  const session = t.session && /^https:\/\/claude\.ai\//.test(t.session) ? t.session : null;
  return { configured: triggerConfigured(), lastFiredAt: t.at ?? null, lastResult: t.result ?? null, session };
}

/* ---- the admin --------------------------------------------------------------- */

export async function saveCriteria(text: string): Promise<void> {
  await writeSetting("criteria", text.slice(0, 50_000));
}

/** Queues `count` sets to build and fires the routine. */
export async function startBuild(count: number, note: string | null, who: string | null): Promise<BuildJob[]> {
  const n = Math.max(1, Math.min(20, Math.round(count)));
  const p = await ready();
  const made: BuildJob[] = [];
  for (let i = 0; i < n; i++) {
    const { rows } = await p.query(
      `insert into claude_build_jobs (id, note, requested_by) values ($1, $2, $3) returning *`,
      [newJobId(), note?.trim().slice(0, 2000) || null, who],
    );
    made.push(toJob(rows[0]));
  }
  await fireTrigger("start");
  return made;
}

/** A waiting job is cancelled at once; a running one is asked to stop at its next step. */
export async function cancelJob(id: string): Promise<void> {
  const p = await ready();
  const { rowCount } = await p.query(
    `update claude_build_jobs set status = 'cancelled', finished_at = now() where id = $1 and status = 'queued'`,
    [id],
  );
  if (!rowCount) await p.query(`update claude_build_jobs set cancel_requested = true where id = $1 and status = 'running'`, [id]);
}

/** A failed or cancelled job goes back to the queue, and the routine is fired. */
export async function retryJob(id: string): Promise<void> {
  const p = await ready();
  const { rowCount } = await p.query(
    `update claude_build_jobs
        set status = 'queued', step = null, detail = null, progress = 0, log = '[]', error = null,
            cancel_requested = false, started_at = null, finished_at = null, heartbeat_at = null
      where id = $1 and status in ('failed', 'cancelled')`,
    [id],
  );
  if (!rowCount) throw new ClaudeBuildFailure("Only a failed or cancelled build can be tried again.", 409);
  await fireTrigger("retry");
}

/* ---- the routine ------------------------------------------------------------- */

async function inTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await (await ready()).connect();
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

/** The next waiting job, now running — or null when there is nothing to build. */
export async function claimJob(): Promise<BuildJob | null> {
  return inTx(async (c) => {
    const { rows } = await c.query(
      `select * from claude_build_jobs where status = 'queued' order by created_at limit 1 for update skip locked`,
    );
    if (!rows[0]) return null;
    const now = new Date().toISOString();
    const log = [{ at: now, step: "claimed", detail: null }];
    const { rows: out } = await c.query(
      `update claude_build_jobs
          set status = 'running', step = 'claimed', progress = 2, started_at = now(), heartbeat_at = now(), log = $2
        where id = $1 returning *`,
      [rows[0].id, JSON.stringify(log)],
    );
    return toJob(out[0]);
  });
}

async function running(c: PoolClient, id: string): Promise<BuildJob> {
  const { rows } = await c.query(`select * from claude_build_jobs where id = $1 for update`, [id]);
  if (!rows[0]) throw new ClaudeBuildFailure("No such build.", 404);
  const job = toJob(rows[0]);
  if (job.status !== "running") throw new ClaudeBuildFailure(`This build is ${job.status}, not running.`, 409);
  return job;
}

/** A step reported. Answers whether the admin asked to cancel — the routine stops if so. */
export async function reportStep(id: string, step: BuildStepKey, detail: string | null, progress: number | null): Promise<{ cancel: boolean }> {
  return inTx(async (c) => {
    const job = await running(c, id);
    const at = new Date().toISOString();
    const log = [...job.log, { at, step, detail: detail?.slice(0, 300) ?? null }].slice(-60);
    const place = BUILD_STEPS.findIndex((s) => s.key === step);
    const pct =
      progress !== null && Number.isFinite(progress)
        ? Math.max(0, Math.min(99, Math.round(progress)))
        : Math.round(((place + 0.5) / BUILD_STEPS.length) * 100);
    await c.query(
      `update claude_build_jobs set step = $2, detail = $3, progress = greatest(progress, $4), log = $5, heartbeat_at = now() where id = $1`,
      [id, step, detail?.slice(0, 300) ?? null, pct, JSON.stringify(log)],
    );
    if (job.cancelRequested) {
      await c.query(`update claude_build_jobs set status = 'cancelled', finished_at = now() where id = $1`, [id]);
      return { cancel: true };
    }
    return { cancel: false };
  });
}

/** The set the job is building, once the routine has created it. */
export async function attachSet(id: string, set: { id: string; slug: string; name: string }): Promise<void> {
  await inTx(async (c) => {
    await running(c, id);
    await c.query(`update claude_build_jobs set set_id = $2, set_slug = $3, set_name = $4, heartbeat_at = now() where id = $1`, [
      id,
      set.id,
      set.slug,
      set.name,
    ]);
  });
}

export async function jobOf(id: string): Promise<BuildJob | null> {
  const p = await ready();
  const { rows } = await p.query(`select * from claude_build_jobs where id = $1`, [id]);
  return rows[0] ? toJob(rows[0]) : null;
}

export async function finishJob(id: string, pages: number): Promise<void> {
  await inTx(async (c) => {
    const job = await running(c, id);
    if (!job.setId) throw new ClaudeBuildFailure("Create the set (action \"set\") before finishing.", 409);
    await c.query(
      `update claude_build_jobs set status = 'done', progress = 100, pages = $2, finished_at = now(), heartbeat_at = now() where id = $1`,
      [id, pages],
    );
  });
}

export async function failJob(id: string, error: string): Promise<void> {
  await inTx(async (c) => {
    await running(c, id);
    await c.query(`update claude_build_jobs set status = 'failed', error = $2, finished_at = now() where id = $1`, [id, error.slice(0, 1000)]);
  });
}

/* ---- firing the routine --------------------------------------------------------- */

/* The "Claude Build PFD" routine's API trigger. The URL alone fires nothing —
   the token (CLAUDE_BUILD_TRIGGER_TOKEN, on the VPS only) is the secret — so
   it is kept here; CLAUDE_BUILD_TRIGGER_URL overrides it. */
const TRIGGER_URL = "https://api.anthropic.com/v1/claude_code/routines/trig_013EEF61JVUgQdM3WfY5iYBz/fire";
const triggerUrl = () => process.env.CLAUDE_BUILD_TRIGGER_URL || TRIGGER_URL;

/** Fireable once the trigger's token is set (see .env.example). */
function triggerConfigured(): boolean {
  return Boolean(triggerUrl() && process.env.CLAUDE_BUILD_TRIGGER_TOKEN);
}

/**
 * Starts the routine now, through its API trigger — `POST …/routines/<id>/fire`
 * with the trigger's own bearer token and an `anthropic-version` header
 * (https://platform.claude.com/docs/en/api/claude-code/routines-fire). It
 * answers once the session exists; the session then works through the queue.
 *
 * ONE SESSION AT A TIME. Each fire opens a new session and there is no
 * idempotency key, so if a build is already running (and alive) nothing is
 * fired: that session claims the newly queued jobs when it finishes its
 * current one. Without a trigger configured the jobs wait for the routine's
 * schedule — slower, nothing lost. Never throws; the panel shows the result.
 */
export async function fireTrigger(reason: string, force = false): Promise<void> {
  if (!triggerConfigured()) {
    await writeSetting("trigger", JSON.stringify({ at: new Date().toISOString(), result: "Chưa cấu hình API trigger — chờ lịch chạy của routine" }));
    return;
  }
  if (!force) {
    const p = await ready();
    const { rows } = await p.query(
      `select 1 from claude_build_jobs where status = 'running' and coalesce(heartbeat_at, started_at) > now() - interval '10 minutes' limit 1`,
    );
    if (rows[0]) {
      await writeSetting("trigger", JSON.stringify({ at: new Date().toISOString(), result: "Đang có phiên chạy — phiên đó sẽ nhận các bộ mới" }));
      return;
    }
  }
  let result: string;
  let session: string | null = null;
  try {
    const res = await fetch(triggerUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.CLAUDE_BUILD_TRIGGER_TOKEN}`,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ text: `PageFly Design Claude Build (${reason}): claim and build every queued set.` }),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
    const body = (await res.json().catch(() => null)) as { claude_code_session_url?: string; error?: { message?: string } } | null;
    if (res.ok) {
      session = body?.claude_code_session_url ?? null;
      result = "Đã gọi routine";
    } else {
      result = `Routine từ chối (${res.status}${body?.error?.message ? `: ${body.error.message.slice(0, 120)}` : ""})`;
      console.error("[claude-build] trigger", res.status, body);
    }
  } catch (err) {
    result = "Không gọi được routine";
    console.error("[claude-build] trigger", err);
  }
  await writeSetting("trigger", JSON.stringify({ at: new Date().toISOString(), result, session }));
}
