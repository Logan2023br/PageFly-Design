import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { CollectionsTabs } from "@/components/admin/collections/CollectionsTabs";
import { missingBuiltIns } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";
import { hasStoreSetDatabase } from "@/lib/storeSetUpsell/db";
import { ssuCounts } from "@/lib/storeSetUpsell/queries";

/* /design/admin/collections — the sets on /collection-pages. Read on the
   server like the other admin screens. */

export const metadata = { title: "Collection pages — PageFly Design Admin" };
export const dynamic = "force-dynamic";

export default async function AdminCollectionsPage(props: PageProps<"/design/admin/collections">) {
  const gate = await adminGate("collections");
  if (gate) return gate;
  const { tab } = await props.searchParams;
  const repo = getRepo();
  /* A failed read of the orders is SAID, not drawn as "No orders yet" — an
     empty list and an unreadable one must never look the same. */
  const [sets, read, leads, referrals] = await Promise.all([
    repo.listCollectionSets().catch(() => []),
    repo.listCollectionOrders().then(
      (orders) => ({ orders, error: null }),
      (err: unknown) => {
        console.error("[collection-pages] orders", err);
        return { orders: [], error: "The orders could not be read — reload to try again." };
      },
    ),
    repo.listCollectionLeads(5000).catch(() => []),
    repo.listReferrals().catch(() => []),
  ]);
  /* What the Upsell button counts: drafts to approve and replies to read. */
  const upsell = hasStoreSetDatabase()
    ? await ssuCounts().then(
        (c) => (c.pending ?? 0) + (c.needs_check ?? 0),
        () => 0,
      )
    : 0;

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
        referralsToCheck={referrals.filter((r) => r.status === "pending").length}
        upsellToCheck={upsell}
        tab={tab === "orders" || tab === "leads" ? tab : "sets"}
      />
    </AdminShell>
  );
}
