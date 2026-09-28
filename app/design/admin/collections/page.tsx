import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminShell } from "@/components/admin/AdminShell";
import { CollectionSetsAdmin } from "@/components/admin/collections/CollectionSetsAdmin";
import { missingBuiltIns } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";
import { readAdminSession } from "@/lib/session";

/* /design/admin/collections — the sets on /collection-pages. Read on the
   server like the other admin screens. */

export const metadata = { title: "Collection pages — PageFly Design Admin" };
export const dynamic = "force-dynamic";

export default async function AdminCollectionsPage() {
  if (!(await readAdminSession())) return <AdminLogin />;
  const sets = await getRepo().listCollectionSets().catch(() => []);

  return (
    <AdminShell
      current="collections"
      title="Collection pages"
      subtitle="The page sets on /collection-pages — what is listed, in what order, and whether it is free"
    >
      <CollectionSetsAdmin initial={sets} missing={missingBuiltIns(sets)} />
    </AdminShell>
  );
}
