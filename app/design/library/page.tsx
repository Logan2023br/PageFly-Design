import { redirect } from "next/navigation";
import { LibraryScreen } from "@/components/library/LibraryScreen";
import { currentAccount } from "@/lib/account";
import { getRepo } from "@/lib/db";
import type { RunSummary } from "@/app/api/runs/route";

/* ==========================================================================
   /design/library

   Reads the runs on the server rather than fetching /api/runs from the client:
   the route already has the session, so an HTTP hop back into our own process
   would only add a round trip and an empty first paint.
   ========================================================================== */

export const metadata = { title: "Library — PageFly Design" };
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const account = await currentAccount().catch(() => null);
  /* The proxy guard redirects when the cookie is missing; this covers the other
     case — a valid cookie for a store that has since left the allowlist. */
  if (!account) redirect("/design/login?next=/design/library");

  const rows = await getRepo().listRuns(account.domain);
  const runs: RunSummary[] = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    /* The pages as they were built. Omitting this was silently discarding the
       Library: with no snapshot the screen replays the brief through the
       deterministic generator, so a merchant who had just watched the model
       design their pages opened the Library and found generator pages instead.
       The data was in the database the whole time — this route was the one
       place it did not travel through.

       Bounded by the page allowance rather than unbounded: a merchant can save
       at most their limit in pages, so the payload is capped at roughly 33 KB
       times that. */
    snapshot: Array.isArray(r.snapshot) ? r.snapshot : null,
    payload: r.payload,
    pageCount: r.pageCount,
    tokens: r.tokens,
    sell: r.sell,
    styleLabel: r.styleLabel,
    pages: r.pages.map((p) => ({
      pageId: p.pageId,
      pageType: p.pageType,
      label: p.label,
      index: p.index,
    })),
  }));

  return <LibraryScreen runs={runs} account={account} />;
}
