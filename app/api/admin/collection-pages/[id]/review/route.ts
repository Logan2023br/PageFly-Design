import { z } from "zod";
import { getRepo } from "@/lib/db";
import { COLLECTION_REVIEWERS } from "@/lib/db/types";
import type { CollectionSetResponse } from "../route";
import { fail, firstIssue, guard } from "../../shared";

/* ==========================================================================
   /api/admin/collection-pages/<id>/review

   PUT   { reviewer }   a TS member takes the set: Reviewing, from now
   PUT   { done: true } the review is finished: Done, at now

   The times are the server's, so two reviewers on two clocks still read one
   order. The answer is the whole set again, as on the other set routes.
   ========================================================================== */

export const dynamic = "force-dynamic";

const body = z.union([
  z.object({ reviewer: z.enum(COLLECTION_REVIEWERS) }),
  z.object({ done: z.literal(true) }),
]);

export async function PUT(
  request: Request,
  ctx: RouteContext<"/api/admin/collection-pages/[id]/review">,
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await ctx.params;
  const repo = getRepo();
  const set = await repo.getCollectionSet(id);
  if (!set) return fail("That set no longer exists.", 404);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const now = new Date().toISOString();

  if ("reviewer" in parsed.data) {
    await repo.setCollectionReview(id, {
      reviewer: parsed.data.reviewer,
      startedAt: now,
      doneAt: null,
    });
  } else {
    if (!set.review) return fail("Nobody is reviewing this set yet.");
    if (!set.review.doneAt) await repo.setCollectionReview(id, { ...set.review, doneAt: now });
  }

  const saved = await repo.getCollectionSet(id);
  return Response.json({ ok: true, set: saved! } satisfies CollectionSetResponse);
}
