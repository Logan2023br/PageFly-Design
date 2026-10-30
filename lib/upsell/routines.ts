import "server-only";

import { db } from "./db";
import { getInternal, getSettings, saveSettings, setInternal } from "./settings";
import { UpsellError } from "./types";

/* ==========================================================================
   The two BPU routines, started through their API triggers instead of
   waiting for the hour.

     BPU Builder  fired when there is something to build: a new lead, a
                  rebuild, a lead back in the queue — and again when a build
                  finishes and more is waiting.
     BPU Ops      fired "send-only" when an approved message can go out now:
                  the admin pressed Duyệt / Gửi ngay, or a page was approved
                  automatically, or the customer's working hours just began.
                  Its hourly run stays: new installs and tracking have no
                  event to start from.

   kickRoutines() looks at the database and fires what is needed. It is
   called after each of those actions and from the 5-minute tick, so a
   missed fire is caught within minutes. It never throws.

   NEVER TWO SENDS OF ONE MESSAGE: a send-only run and the hourly run can
   overlap, so the script claims the messages it sends (approvedForSending
   with claim) — a claimed message is invisible to any other run for 15
   minutes, and a message claimed three times without being reported (the
   runs keep dying on it) stops firing anything until an admin looks.
   ========================================================================== */

export const ROUTINES = {
  builder: { label: "BPU Builder", id: "trig_016KjCNBQWEpQ29iiW2Juhw7", env: "BPU_BUILDER_TRIGGER_TOKEN" },
  ops: { label: "BPU Ops", id: "trig_01RNGjgS2Xdg9zJJZHCeLXMJ", env: "BPU_OPS_TRIGGER_TOKEN" },
} as const;
export type RoutineId = keyof typeof ROUTINES;

/* A fired session needs a minute or two to start and claim its work; within
   this window another fire would only start a second session for nothing. */
const DEBOUNCE_MS: Record<RoutineId, number> = { builder: 5 * 60_000, ops: 2 * 60_000 };
/* A lead in `building` for longer than this is a dead run (the tick requeues it at 3 h). */
const BUILD_ALIVE_MIN = 90;

export type FireState = { at: string; reason: string; result: string; ok: boolean; session?: string | null };

const fireUrl = (r: RoutineId) =>
  process.env[`${ROUTINES[r].env.replace("_TOKEN", "_URL")}`] || `https://api.anthropic.com/v1/claude_code/routines/${ROUTINES[r].id}/fire`;

/** The trigger's token: the VPS env first, else the one pasted on Cài đặt. */
export async function triggerToken(r: RoutineId): Promise<{ token: string | null; from: "env" | "panel" | null }> {
  const env = process.env[ROUTINES[r].env]?.trim();
  if (env) return { token: env, from: "env" };
  const saved = await getInternal(`${r}_trigger_token`);
  return typeof saved === "string" && saved ? { token: saved, from: "panel" } : { token: null, from: null };
}

export async function saveTriggerToken(r: RoutineId, token: string): Promise<void> {
  const t = token.trim();
  /* A routine's API trigger token: one line, no spaces. Anything else is a paste gone wrong. */
  if (t && !/^[A-Za-z0-9._-]{20,400}$/.test(t)) throw new UpsellError("Token không đúng dạng.", 422);
  await setInternal(`${r}_trigger_token`, t);
}

export async function lastFire(r: RoutineId): Promise<FireState | null> {
  return ((await getInternal(`${r}_fire`)) as FireState | null) ?? null;
}

/** Fires one routine now. `force` skips the debounce (the admin's button). */
export async function fireRoutine(r: RoutineId, reason: string, force = false, full = false): Promise<FireState> {
  const prev = await lastFire(r);
  if (!force && prev?.ok && Date.now() - new Date(prev.at).getTime() < DEBOUNCE_MS[r]) return prev;
  const { token } = await triggerToken(r);
  const at = new Date().toISOString();
  if (!token) {
    const s: FireState = { at, reason, result: "Chưa có token API trigger — chờ lịch chạy của routine", ok: false };
    /* Not recorded over and over from the tick: the panel shows it once. */
    if (prev?.result !== s.result) await setInternal(`${r}_fire`, s);
    return s;
  }
  /* Ops runs every step only when asked ("Chạy đầy đủ"); fired by an action, it only sends. */
  const text =
    r === "ops"
      ? full
        ? `full run — ${reason}. Run every step.`
        : `send-only — ${reason}. Only send the approved messages now (step 5) and give a two-line summary; skip the other steps.`
      : `${reason}. Build the queue.`;
  let s: FireState;
  try {
    const res = await fetch(fireUrl(r), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ text: `PageFly Design BPU: ${text}` }),
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
    const body = (await res.json().catch(() => null)) as { claude_code_session_url?: string; error?: { message?: string } } | null;
    s = res.ok
      ? { at, reason, result: "Đã gọi routine", ok: true, session: body?.claude_code_session_url ?? null }
      : { at, reason, result: `Routine từ chối (${res.status}${body?.error?.message ? `: ${body.error.message.slice(0, 120)}` : ""})`, ok: false };
    if (!res.ok) console.error("[upsell] fire", r, res.status, body?.error?.message);
  } catch (err) {
    s = { at, reason, result: "Không gọi được routine", ok: false };
    console.error("[upsell] fire", r, err);
  }
  await setInternal(`${r}_fire`, s);
  return s;
}

/** Messages the script would send right now: approved, not claimed, the lead
    still installed, and Gửi ngay or inside the customer's hours. */
export const READY_SQL = (start: string, end: string) => `
  m.status = 'approved'
  and (m.claimed_until is null or m.claimed_until < now())
  and l.status <> 'uninstalled'
  and coalesce(l.app_status, '') <> 'uninstalled'
  and (m.kind not in ('followup1', 'followup2', 'review', 'view_reminder', 'edit_offer') or l.crisp_session is not null)
  and (m.send_mode = 'now'
       or coalesce((select extract(hour from now() at time zone z.name)::int from pg_timezone_names z where z.name = l.timezone), 12)
          between ${start} and ${end} - 1)`;

/** What is waiting for each routine, and a fire where something is. */
export async function kickRoutines(reason: string): Promise<{ builder?: FireState; ops?: FireState }> {
  const out: { builder?: FireState; ops?: FireState } = {};
  try {
    const p = await db();
    const cfg = await getSettings(p);
    const { rows } = await p.query<{ queued: number; building: number; ready: number }>(
      `select
         (select count(*)::int from upsell_leads where "group" = 'test' and status in ('new', 'rebuild_requested')) as queued,
         (select count(*)::int from upsell_leads where status = 'building'
            and coalesce(build_started_at, updated_at) > now() - make_interval(mins => $3)) as building,
         (select count(*)::int from upsell_messages m join upsell_leads l on l.lead_id = m.lead_id where ${READY_SQL("$1", "$2")} and m.claims < 3) as ready`,
      [cfg.send_hour_start, cfg.send_hour_end, BUILD_ALIVE_MIN],
    );
    const n = rows[0];
    /* One Builder session at a time: a running one picked its list already,
       and its finishing upload kicks again for what is left. */
    if (n.queued > 0 && n.building === 0) out.builder = await fireRoutine("builder", reason);
    if (n.ready > 0) out.ops = await fireRoutine("ops", reason);
  } catch (err) {
    console.error("[upsell] kick", err);
  }
  return out;
}

/** After an action, without holding up the response. */
export function kickSoon(reason: string): void {
  void kickRoutines(reason);
}

/* ---- Duyệt / Không duyệt ----------------------------------------------------

   One switch over the modes that decide whether anything waits for an admin:
   the pages after a build, the first message, and the messages PageFly
   Design writes itself. Không duyệt runs straight through — built, approved,
   sent at once. A message kind switched off stays off. */

const APPROVAL_KEYS = ["page_review_mode", "build_message_mode", "view_reminder_mode", "edit_offer_mode"] as const;

export async function approvalMode(): Promise<"review" | "auto"> {
  const cfg = await getSettings();
  return cfg.page_review_mode === "auto" && cfg.build_message_mode === "auto" ? "auto" : "review";
}

export async function setApprovalMode(mode: "review" | "auto"): Promise<void> {
  const cfg = await getSettings();
  const patch: Record<string, string> = {};
  for (const k of APPROVAL_KEYS) {
    if (k !== "page_review_mode" && cfg[k] === "off") continue;
    patch[k] = mode === "auto" ? "auto" : "manual";
  }
  await saveSettings(patch);
  if (mode === "auto") kickSoon("chuyển sang Không duyệt");
}
