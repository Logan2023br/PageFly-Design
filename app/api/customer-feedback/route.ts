import { z } from "zod";
import { getRepo } from "@/lib/db";
import { forwardReview } from "@/lib/review";
import { normalizeDomain } from "@/lib/sheet";

/* ==========================================================================
   POST /api/customer-feedback

   The one endpoint here that writes to the database with no session behind it.
   It exists so a rating can be collected from a link sent to a merchant —
   /customer-feedback?domain=abc.myshopify.com — without asking them to sign in
   to leave one.

   Two things it deliberately does NOT do:

   - It does not create a row in `stores`. That table IS the allowlist that
     /api/auth/store reads, so writing to it from an unauthenticated endpoint
     would let anyone grant their own domain access to the app by submitting a
     rating. A review from an unknown domain is recorded as a review and
     nothing more; `listStoreSummaries` is what makes it visible to an admin.
   - It does not replace an existing review. The same rule as the in-app form:
     the first answer stands, and a second submission is answered as already
     reviewed rather than as an error — the merchant did nothing wrong.

   The rating is written to our database FIRST and forwarded to the webhook
   second, for the same reason as /api/review: losing a rating because an
   automation was unavailable is the worse failure.
   ========================================================================== */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  domain: z.string().min(1).max(255),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(2000).default(""),
});

export type FeedbackResponse =
  | { ok: true; alreadyReviewed: boolean }
  | { ok: false; error: string };

function fail(error: string): Response {
  return Response.json({ ok: false, error } satisfies FeedbackResponse, {
    status: 400,
  });
}

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return fail("Pick a rating from 1 to 5.");
  }

  /* The domain arrives from a query string a human may have edited, so it gets
     the same treatment as one typed into the sign-in form: scheme, www, path
     and case all stripped before it is used as a key. */
  const domain = normalizeDomain(body.domain);
  if (!domain.includes("."))
    return fail("This feedback link is missing a store domain.");

  const repo = getRepo();

  const existing = await repo.getReview(domain);
  if (existing)
    return Response.json({
      ok: true,
      alreadyReviewed: true,
    } satisfies FeedbackResponse);

  const createdAt = new Date().toISOString();
  const comment = body.comment.trim();

  await repo.saveReview({
    domain,
    stars: body.stars,
    comment: comment || null,
    createdAt,
    forwarded: false,
  });

  const forwarded = await forwardReview({
    domain,
    stars: body.stars,
    comment,
    createdAt,
    source: "feedback-link",
  });

  if (forwarded)
    await repo.saveReview({
      domain,
      stars: body.stars,
      comment: comment || null,
      createdAt,
      forwarded: true,
    });

  return Response.json({
    ok: true,
    alreadyReviewed: false,
  } satisfies FeedbackResponse);
}
