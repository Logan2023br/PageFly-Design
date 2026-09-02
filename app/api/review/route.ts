import { z } from "zod";
import { currentAccount } from "@/lib/account";
import { getRepo } from "@/lib/db";
import { forwardReview } from "@/lib/review";

/* ==========================================================================
   POST /api/review

   One review per store, for ever. Enforced by the primary key on `reviews`, not
   only by hiding the form: the form can be reopened from a second tab, and a
   store's rating is not something a second submission should overwrite.

   The rating is written to our database FIRST and forwarded to the webhook
   second. If the webhook is down, unset, or slow, the review is still recorded
   and `forwarded` stays false so it can be retried — losing a merchant's rating
   because an automation was unavailable would be the worse failure.
   ========================================================================== */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(2000).default(""),
});

export type ReviewResponse =
  | { ok: true; alreadyReviewed: boolean }
  | { ok: false; error: string };

export async function POST(request: Request) {
  const account = await currentAccount();
  if (!account)
    return Response.json(
      { ok: false, error: "Not signed in." } satisfies ReviewResponse,
      { status: 401 },
    );

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      { ok: false, error: "Pick a rating from 1 to 5." } satisfies ReviewResponse,
      { status: 400 },
    );
  }

  const repo = getRepo();
  const existing = await repo.getReview(account.domain);
  if (existing) {
    /* Not an error from the merchant's point of view — they have already been
       thanked, so answer as if it succeeded and say which case it was. */
    return Response.json({
      ok: true,
      alreadyReviewed: true,
    } satisfies ReviewResponse);
  }

  const createdAt = new Date().toISOString();
  const comment = body.comment.trim();

  await repo.saveReview({
    domain: account.domain,
    stars: body.stars,
    comment: comment || null,
    createdAt,
    forwarded: false,
  });

  const forwarded = await forwardReview({
    domain: account.domain,
    storeName: account.storeName,
    email: account.email,
    stars: body.stars,
    comment,
    createdAt,
    pagesUsed: account.pagesUsed,
  });

  if (forwarded) {
    await repo.saveReview({
      domain: account.domain,
      stars: body.stars,
      comment: comment || null,
      createdAt,
      forwarded: true,
    });
  }

  return Response.json({ ok: true, alreadyReviewed: false } satisfies ReviewResponse);
}
