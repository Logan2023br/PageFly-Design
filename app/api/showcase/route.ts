import { getRepo } from "@/lib/db";
import { showcasePages } from "@/lib/showcase";

/* ==========================================================================
   GET /api/showcase — what the front door shows.

   PUBLIC, and the only public endpoint in the app, so the shape of what it
   returns is the whole security surface. `showcasePages` picks the fields
   rather than deleting them, and the counts below are aggregates that name no
   store.

   Never fails the page. A front door that 500s because a demo run was deleted
   is worse than one with a section missing, and the caller renders nothing when
   the arrays come back empty.
   ========================================================================== */

export const dynamic = "force-dynamic";

export async function GET() {
  const pages = await showcasePages().catch(() => []);

  /* Only the true ones. A landing page claiming a review score before anyone
     has reviewed anything is the single thing on it that cannot be undone once
     a visitor notices — so a count that is zero is omitted, not shown as zero
     and not invented. */
  let counts: {
    stores?: number;
    pages?: number;
    reviews?: number;
    rating?: number;
  } = {};

  try {
    const s = await getRepo().stats();
    counts = {
      ...(s.allowedStores > 0 ? { stores: s.allowedStores } : {}),
      ...(s.totalPages > 0 ? { pages: s.totalPages } : {}),
      ...(s.reviews.total > 0
        ? { reviews: s.reviews.total, rating: Math.round(s.reviews.average * 10) / 10 }
        : {}),
    };
  } catch {
    /* No database yet, or a driver that cannot count. The section renders
       nothing, which is the honest answer to "how many". */
  }

  return Response.json(
    { pages, counts },
    {
      /* Cheap to compute and identical for everyone. A minute is short enough
         that a new showcase run appears while someone is still looking at the
         tab, and long enough that a link doing the rounds does not read the
         database once per visitor. */
      headers: { "cache-control": "public, max-age=60, s-maxage=60" },
    },
  );
}
