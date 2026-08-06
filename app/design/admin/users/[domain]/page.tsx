import { notFound } from "next/navigation";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminShell } from "@/components/admin/AdminShell";
import { LibraryContent } from "@/components/library/LibraryScreen";
import { getRepo } from "@/lib/db";
import { readAdminSession } from "@/lib/session";
import { normalizeDomain } from "@/lib/sheet";
import type { RunSummary } from "@/app/api/runs/route";

/* ==========================================================================
   /design/admin/users/[domain]

   One store's pages, shown with the SAME results screen the merchant sees, so
   an operator is looking at what the merchant is looking at rather than at a
   second rendering that could disagree.

   The chrome-free LibraryContent is used, not the merchant page: this already
   sits inside the admin shell, and the full version would nest a second header,
   a second glow and another store's page quota inside it.
   ========================================================================== */

export const dynamic = "force-dynamic";

export default async function AdminStorePagesPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  if (!(await readAdminSession())) return <AdminLogin />;

  const { domain: raw } = await params;
  const domain = normalizeDomain(decodeURIComponent(raw));

  const repo = getRepo();
  const store = await repo.getStore(domain);
  if (!store) notFound();

  const rows = await repo.listRuns(domain);
  const runs: RunSummary[] = rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
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

  return (
    <AdminShell
      current="users"
      title={store.storeName || store.domain}
      subtitle={`${store.domain} · ${runs.length} ${runs.length === 1 ? "build" : "builds"} · ${runs.reduce((n, r) => n + r.pageCount, 0)}/${store.pageLimit} pages`}
    >
      <LibraryContent runs={runs} ownerLabel={store.storeName || store.domain} />
    </AdminShell>
  );
}
