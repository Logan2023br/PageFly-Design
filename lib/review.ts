import "server-only";

/* ==========================================================================
   Handing a review to the n8n webhook, which is what writes the star rating
   into the sheet.

   Extracted from the signed-in route once the public feedback link needed the
   same thing. A route importing another route's helper would have made the two
   endpoints depend on each other's HTTP shape for the sake of one fetch.

   The URL is configuration, not code: REVIEW_WEBHOOK_URL. Until it is set this
   returns false and the review sits in the database with forwarded = false,
   which is exactly the state a later retry needs.
   ========================================================================== */

export async function forwardReview(
  payload: Record<string, unknown>,
): Promise<boolean> {
  const url = process.env.REVIEW_WEBHOOK_URL;
  if (!url) return false;

  try {
    /* Bounded: a hanging webhook must not hold the merchant's request open. The
       review is already saved, so giving up here costs nothing but a retry. */
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.REVIEW_WEBHOOK_SECRET
          ? { "x-webhook-secret": process.env.REVIEW_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
