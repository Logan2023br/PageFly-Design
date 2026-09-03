import { createHash, timingSafeEqual } from "node:crypto";
import { getRepo } from "@/lib/db";
import { readAdminSession } from "@/lib/session";

/* ==========================================================================
   GET /api/admin/pending-reviews

   The stores that have built pages and never said what they thought — the
   admin Users table read through one filter, for something that is not a
   browser.

   It exists because that table has no API behind it. `/design/admin/users` is
   a server component that calls `listStoreSummaries()` directly and renders
   HTML, so an automation asking the same question had nothing to call and no
   way to sign in.

   AUTHENTICATED THE SAME WAY AS /api/admin/sync, deliberately: a header
   holding SYNC_SECRET, or an admin session for anyone poking at it from a
   signed-in browser. A second scheme for the same class of caller is a second
   thing to get wrong, and the secret is compared the same constant-time way.

   WHO IS LEFT OUT is the part worth reading. A store that already rated us is
   never asked twice; a store that has built nothing has nothing to review; a
   blocked store is one access was taken away from, and mailing them an
   invitation would be the app asking for an opinion on something they can no
   longer open.

   A store with no email address IS included. Hiding it would make `count`
   disagree with the admin table for reasons the caller cannot see, and whether
   a missing address means "skip" or "look it up" is the automation's decision,
   not this route's.
   ========================================================================== */

export const dynamic = "force-dynamic";

export type PendingReviewStore = {
  domain: string;
  storeName: string | null;
  email: string | null;
  pagesUsed: number;
  pageLimit: number;
  runCount: number;
  /** ISO of their most recent build, or null */
  lastRunAt: string | null;
  /** the link to send them, built here so the caller never assembles a URL */
  feedbackUrl: string;
};

export type PendingReviewsResponse =
  | { ok: true; count: number; stores: PendingReviewStore[] }
  | { ok: false; error: string };

function secretMatches(header: string | null): boolean {
  const expected = process.env.SYNC_SECRET;
  if (!expected || !header) return false;
  // Hashed first so the compare is constant time regardless of length.
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(header), digest(expected));
}

/**
 * Where the feedback link points.
 *
 * The request's own origin by default, so a call to the production host builds
 * production links and a call to localhost builds local ones — nothing to
 * configure and nothing to get out of step with the deployment. PFD_PUBLIC_URL
 * overrides it for the case the default cannot serve: a proxy that rewrites the
 * Host header, where the origin this process sees is not the one a merchant can
 * open.
 */
function publicOrigin(request: Request): string {
  const override = process.env.PFD_PUBLIC_URL?.trim();
  if (override) return override.replace(/\/+$/, "");
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  /* The secret is checked first and short-circuits, so the cookie store is only
     reached for a caller that did not bring one. `readAdminSession` is wrapped
     because reading cookies throws where there is no request scope — a test
     harness, a script — and the only thing that branch can do is GRANT access.
     Treating an unavailable cookie store as "no admin session" is therefore
     both true and the safe direction to fail in. */
  const authorised =
    secretMatches(request.headers.get("x-sync-secret")) ||
    (await readAdminSession().catch(() => null));

  if (!authorised)
    return Response.json(
      { ok: false, error: "Not authorised." } satisfies PendingReviewsResponse,
      { status: 401 },
    );

  const origin = publicOrigin(request);
  const summaries = await getRepo().listStoreSummaries();

  const stores = summaries
    .filter((s) => s.pagesUsed > 0 && s.review === null && !s.blocked)
    /* Newest builder first. The list is read by something that may take only
       the first N of it, and the merchant who built yesterday is the one worth
       asking — a build from three months ago is not fresh in anyone's mind. */
    .sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""))
    .map(
      (s): PendingReviewStore => ({
        domain: s.domain,
        storeName: s.storeName,
        email: s.email,
        pagesUsed: s.pagesUsed,
        pageLimit: s.pageLimit,
        runCount: s.runCount,
        lastRunAt: s.lastRunAt,
        feedbackUrl: `${origin}/customer-feedback?domain=${encodeURIComponent(s.domain)}`,
      }),
    );

  return Response.json({
    ok: true,
    count: stores.length,
    stores,
  } satisfies PendingReviewsResponse);
}
