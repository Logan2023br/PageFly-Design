import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminShell } from "@/components/admin/AdminShell";
import { CollectionsTabs } from "@/components/admin/collections/CollectionsTabs";
import { missingBuiltIns } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";
import { readAdminSession } from "@/lib/session";

/* /design/admin/collections — the sets on /collection-pages. Read on the
   server like the other admin screens. */

export const metadata = { title: "Collection pages — PageFly Design Admin" };
export const dynamic = "force-dynamic";

export default async function AdminCollectionsPage(props: PageProps<"/design/admin/collections">) {
  if (!(await readAdminSession())) return <AdminLogin />;
  const { tab } = await props.searchParams;
  const repo = getRepo();
  /* A failed read of the orders is SAID, not drawn as "No orders yet" — an
     empty list and an unreadable one must never look the same. */
  const [sets, read, leads] = await Promise.all([
    repo.listCollectionSets().catch(() => []),
    repo.listCollectionOrders().then(
      (orders) => ({ orders, error: null }),
      (err: unknown) => {
        console.error("[collection-pages] orders", err);
        return { orders: [], error: "The orders could not be read — reload to try again." };
      },
    ),
    repo.listCollectionLeads(5000).catch(() => []),
  ]);

  return (
    <AdminShell
      current="collections"
      title="Collection pages"
      subtitle="The page sets on /collection-pages — what is listed, in what order, and whether it is free"
    >
      <CollectionsTabs
        sets={sets}
        missing={missingBuiltIns(sets)}
        orders={read.orders}
        ordersError={read.error}
        leads={leads}
        tab={tab === "orders" || tab === "leads" ? tab : "sets"}
      />
    </AdminShell>
  );
}
