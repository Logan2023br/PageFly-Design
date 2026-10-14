import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { CollectionAnalytics } from "@/components/admin/collections/CollectionAnalytics";

/* /design/admin/collections/analytics — how /collection-pages is used. A
   static segment, so it wins over `[id]`. The figures are fetched by the
   client, which lets the window and the day change without a reload. */

export const metadata = { title: "Collection pages analytics — PageFly Design Admin" };
export const dynamic = "force-dynamic";

export default async function CollectionAnalyticsPage() {
  const gate = await adminGate("collections");
  if (gate) return gate;
  return (
    <AdminShell
      current="collections"
      title="Collection pages analytics"
      subtitle="Traffic, downloads, purchases and orders on /collection-pages"
    >
      <CollectionAnalytics />
    </AdminShell>
  );
}
