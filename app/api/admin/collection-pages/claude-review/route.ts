import { z } from "zod";
import { ClaudeReviewFailure, adminAct, readState, runnerPatch } from "@/lib/claudeReview";
import { readAdminName } from "@/lib/session";
import { fail, firstIssue, guardOrKey } from "../shared";

/* ==========================================================================
   /api/admin/collection-pages/claude-review

   GET   the run's state                              admin cookie or key
   POST  { action: "start" | "stop" }                 admin cookie only
   PUT   { ...fields of ClaudeReviewState }           key only — the runner's progress

   The button asks; the scheduled Claude task does the work and reports here.
   ========================================================================== */

export const dynamic = "force-dynamic";

const nocache = { headers: { "Cache-Control": "no-store" } };

function failFrom(err: unknown) {
  if (err instanceof ClaudeReviewFailure) return fail(err.message, err.status);
  console.error("[claude-review]", err);
  return fail("Could not read the review state — try again.", 500);
}

export async function GET(request: Request) {
  const who = await guardOrKey(request);
  if (who instanceof Response) return who;
  try {
    return Response.json({ ok: true, state: await readState() }, nocache);
  } catch (err) {
    return failFrom(err);
  }
}

const act = z.object({ action: z.enum(["start", "stop"]) });

export async function POST(request: Request) {
  const who = await guardOrKey(request);
  if (who instanceof Response) return who;
  if (who !== "admin") return fail("Start and stop are the admin's buttons.", 403);
  const parsed = act.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  try {
    return Response.json({ ok: true, state: await adminAct(parsed.data.action, await readAdminName()) }, nocache);
  } catch (err) {
    return failFrom(err);
  }
}

const item = z.object({
  slug: z.string(),
  name: z.string(),
  result: z.enum(["done", "reimport", "skipped", "failed"]),
  note: z.string().max(2000).optional(),
  finishedAt: z.string(),
  secs: z.number().optional(),
  folder: z.string().optional(),
});
const patch = z
  .object({
    status: z.enum(["idle", "requested", "running", "stopping", "stopped", "finished"]),
    startedAt: z.string().nullable(),
    current: z.object({ slug: z.string(), name: z.string(), step: z.string(), startedAt: z.string() }).nullable(),
    queue: z.array(z.object({ slug: z.string(), name: z.string() })).max(500),
    done: z.array(item).max(500),
    avgSecs: z.number().nullable(),
    message: z.string().max(2000).nullable(),
    errors: z
      .array(
        z.object({
          at: z.string(),
          slug: z.string().nullable(),
          name: z.string().nullable(),
          step: z.string().max(200),
          message: z.string().max(2000),
        }),
      )
      .max(250),
  })
  .partial();

export async function PUT(request: Request) {
  const who = await guardOrKey(request);
  if (who instanceof Response) return who;
  if (who !== "script") return fail("Progress is written by the runner.", 403);
  const parsed = patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  try {
    return Response.json({ ok: true, state: await runnerPatch(parsed.data) }, nocache);
  } catch (err) {
    return failFrom(err);
  }
}
