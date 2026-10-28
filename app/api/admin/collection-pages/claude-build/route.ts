import { z } from "zod";
import { RESERVED_SET_SLUGS, slugify } from "@/lib/collectionPages";
import { newId } from "@/lib/collectionPagesServer";
import {
  ClaudeBuildFailure,
  attachSet,
  cancelJob,
  claimJob,
  failJob,
  finishJob,
  fireTrigger,
  isBuildStep,
  jobOf,
  listJobs,
  readSetting,
  readTrigger,
  reportStep,
  retryJob,
  saveCriteria,
  saveTriggerToken,
  startBuild,
} from "@/lib/claudeBuild";
import { getRepo } from "@/lib/db";
import { readAdminName } from "@/lib/session";
import { fail, failFrom, firstIssue, buildGuardOrKey } from "../shared";

/* ==========================================================================
   /api/admin/collection-pages/claude-build

   GET   jobs, criteria, trigger                       admin cookie or key

   POST  admin cookie:
     { action: "start", count, note? }     queue `count` sets and fire the routine
     { action: "cancel", id }              a waiting job at once, a running one at its next step
     { action: "retry", id }               a failed or cancelled job back to the queue
     { action: "criteria", text }          the build criteria the routine follows
     { action: "fire" }                    fire the routine again by hand

   POST  key (the routine):
     { action: "claim" }                   → { job, criteria } — or job null: nothing to build
     { action: "step", id, step, detail?, progress? }  → { cancel } — stop if true
     { action: "set", id, name, blurb? }   → { set: { id, slug } } — the set to upload into
     { action: "finish", id }              the set is uploaded
     { action: "fail", id, error }

   Files go to PUT …/claude-build/files (see that route).
   ========================================================================== */

export const dynamic = "force-dynamic";
const nocache = { headers: { "Cache-Control": "no-store" } };

function failBuild(err: unknown) {
  if (err instanceof ClaudeBuildFailure) return fail(err.message, err.status);
  return failFrom(err);
}

export async function GET(request: Request) {
  const who = await buildGuardOrKey(request);
  if (who instanceof Response) return who;
  try {
    const [jobs, criteria, trigger] = await Promise.all([listJobs(), readSetting("criteria"), readTrigger()]);
    return Response.json({ ok: true, jobs, criteria: criteria ?? "", trigger }, nocache);
  } catch (err) {
    return failBuild(err);
  }
}

const adminBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), count: z.number().int().min(1).max(20), note: z.string().max(2000).optional() }),
  z.object({ action: z.literal("cancel"), id: z.string().max(64) }),
  z.object({ action: z.literal("retry"), id: z.string().max(64) }),
  z.object({ action: z.literal("criteria"), text: z.string().max(50_000) }),
  z.object({ action: z.literal("fire") }),
  z.object({ action: z.literal("token"), token: z.string().max(400) }),
]);

const scriptBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({
    action: z.literal("step"),
    id: z.string().max(64),
    step: z.string().max(40),
    detail: z.string().max(300).optional(),
    progress: z.number().min(0).max(100).optional(),
  }),
  z.object({ action: z.literal("set"), id: z.string().max(64), name: z.string().trim().min(1).max(120), blurb: z.string().max(400).optional() }),
  z.object({ action: z.literal("finish"), id: z.string().max(64) }),
  z.object({ action: z.literal("fail"), id: z.string().max(64), error: z.string().max(1000) }),
]);

export async function POST(request: Request) {
  const who = await buildGuardOrKey(request);
  if (who instanceof Response) return who;
  const raw = await request.json().catch(() => null);
  try {
    if (who === "admin") {
      const parsed = adminBody.safeParse(raw);
      if (!parsed.success) return fail(firstIssue(parsed.error));
      const b = parsed.data;
      if (b.action === "start") await startBuild(b.count, b.note ?? null, await readAdminName());
      else if (b.action === "cancel") await cancelJob(b.id);
      else if (b.action === "retry") await retryJob(b.id);
      else if (b.action === "criteria") await saveCriteria(b.text);
      else if (b.action === "token") await saveTriggerToken(b.token);
      else await fireTrigger("by hand", true);
      return Response.json({ ok: true }, nocache);
    }

    const parsed = scriptBody.safeParse(raw);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const b = parsed.data;
    if (b.action === "claim") {
      const job = await claimJob();
      /* Every set we already have, so the routine builds something none of
         them is: a new industry and concept, a look of its own. */
      const existing = job ? (await getRepo().listCollectionSets()).map((s) => ({ name: s.name, blurb: s.blurb })) : null;
      return Response.json({ ok: true, job, criteria: job ? ((await readSetting("criteria")) ?? "") : null, existing }, nocache);
    }
    if (b.action === "step") {
      if (!isBuildStep(b.step)) return fail("step must be one of: claimed, idea, style, html, review, pagefly, check, upload.");
      return Response.json({ ok: true, ...(await reportStep(b.id, b.step, b.detail ?? null, b.progress ?? null)) }, nocache);
    }
    if (b.action === "set") {
      const job = await jobOf(b.id);
      if (!job || job.status !== "running") return fail("This build is not running.", 409);
      if (job.setId) return Response.json({ ok: true, set: { id: job.setId, slug: job.setSlug } }, nocache);
      /* A new set, as Preview — on /collection-pages-preview for the team to
         check (TS Review), not on the public list until someone shows it. */
      const repo = getRepo();
      const sets = await repo.listCollectionSets();
      const taken = new Set(sets.map((s) => s.slug));
      const base = slugify(b.name) || "set";
      let slug = RESERVED_SET_SLUGS.has(base) ? `${base}-set` : base;
      for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
      const id = newId();
      await repo.saveCollectionSet({
        id,
        slug,
        name: b.name,
        blurb: b.blurb ?? "",
        visibility: "preview",
        access: "free",
        priceCents: null,
        buyUrl: null,
        position: Math.max(0, ...sets.map((s) => s.position)) + 1,
      });
      await attachSet(b.id, { id, slug, name: b.name });
      return Response.json({ ok: true, set: { id, slug } }, nocache);
    }
    if (b.action === "finish") {
      const job = await jobOf(b.id);
      const set = job?.setId ? await getRepo().getCollectionSet(job.setId) : null;
      const pages = set ? set.pages.filter((p) => p.htmlSize !== null && p.pageflySize !== null).length : 0;
      if (!pages) return fail("No page has both its .html and .pagefly yet.", 409);
      await finishJob(b.id, pages);
      return Response.json({ ok: true, pages }, nocache);
    }
    await failJob(b.id, b.error);
    return Response.json({ ok: true }, nocache);
  } catch (err) {
    return failBuild(err);
  }
}
