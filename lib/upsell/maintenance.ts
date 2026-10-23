import "server-only";

import { db, hasUpsellDatabase, tx } from "./db";
import { recordStatus } from "./common";
import { updateLead } from "./leads";
import { flushSlack } from "./notify";
import { runAutoMessages, type AutoResult } from "./autoMessages";
import { removeDesignFiles } from "./storage";
import type { LeadRow } from "./types";

/* ==========================================================================
   The housekeeping a cron would do, run in-process.

   One Node process on the VPS, so `instrumentation.ts` starts a timer and
   that is the cron; `POST /api/upsell/cron` runs the same tick on demand. All
   three jobs are idempotent, so a tick that runs twice is harmless.

   1. A lead stuck in `building` for 3 hours goes back to the queue — the
      Builder run that took it died. The second time it is `error`, because a
      lead that kills every build would otherwise be retried for ever.
   2. Design files 60 days past expiry are deleted. Rows and events stay.
   3. Slack notifications held back by the 15-minute window go out.
   ========================================================================== */

export const BUILD_TIMEOUT_HOURS = 3;
export const MAX_BUILD_TIMEOUTS = 2;
export const PURGE_AFTER_DAYS = 60;

export type TickResult = { requeued: string[]; errored: string[]; purged: string[]; slack: boolean; auto?: AutoResult };

export async function tick(): Promise<TickResult> {
  const out: TickResult = { requeued: [], errored: [], purged: [], slack: false };
  const p = await db();

  const stale = await p.query<{ lead_id: string }>(
    `select lead_id from upsell_leads
      where status = 'building' and coalesce(build_started_at, updated_at) < now() - make_interval(hours => $1)`,
    [BUILD_TIMEOUT_HOURS],
  );
  for (const { lead_id } of stale.rows) {
    await tx(async (c) => {
      const { rows } = await c.query<LeadRow>("select * from upsell_leads where lead_id = $1 for update", [lead_id]);
      const lead = rows[0];
      if (!lead || lead.status !== "building") return;
      const timeouts = lead.build_timeouts + 1;
      if (timeouts >= MAX_BUILD_TIMEOUTS) {
        const error = `Build quá ${BUILD_TIMEOUT_HOURS} giờ lần thứ ${timeouts}`;
        await updateLead(c, lead_id, { status: "error", build_timeouts: timeouts, error });
        await recordStatus(c, lead_id, "building", "error", "system", { reason: "build timeout", timeouts });
        out.errored.push(lead_id);
      } else {
        const d = await c.query("select 1 from upsell_designs where lead_id = $1", [lead_id]);
        const to = d.rows[0] || lead.rebuild_note ? "rebuild_requested" : "new";
        await updateLead(c, lead_id, { status: to, build_timeouts: timeouts });
        await recordStatus(c, lead_id, "building", to, "system", { reason: "build timeout", timeouts });
        out.requeued.push(lead_id);
      }
    });
  }

  const old = await p.query<{ id: string }>(
    `select id from upsell_designs
      where files_purged_at is null and expires_at < now() - make_interval(days => $1)`,
    [PURGE_AFTER_DAYS],
  );
  for (const { id } of old.rows) {
    await removeDesignFiles(id);
    await p.query("update upsell_designs set files_purged_at = now() where id = $1", [id]);
    out.purged.push(id);
  }

  /* 4. The automatic messages (view reminder, edit offer), per their modes. */
  out.auto = await runAutoMessages().catch((err) => {
    console.error("[upsell] auto messages", err);
    return undefined;
  });
  out.slack = await flushSlack().catch(() => false);
  return out;
}

const TICK_MS = 5 * 60 * 1000;
let started = false;

/** Called once from instrumentation.ts. Every 5 minutes — finer than the
    30-minute check needs, so a Slack batch is not held longer than its
    window. Does nothing without Postgres. */
export function startUpsellTimer(): void {
  if (started || !hasUpsellDatabase() || process.env.UPSELL_DISABLE_TIMER === "1") return;
  started = true;
  const run = () =>
    tick().then(
      (r) => {
        if (r.requeued.length || r.errored.length || r.purged.length) console.log("[upsell] tick", JSON.stringify(r));
      },
      (err) => console.error("[upsell] tick failed", err),
    );
  setTimeout(run, 30_000).unref?.();
  setInterval(run, TICK_MS).unref?.();
}
