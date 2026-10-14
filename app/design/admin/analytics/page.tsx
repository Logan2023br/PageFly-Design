import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { AnalyticsView } from "@/components/admin/AnalyticsView";

/* ==========================================================================
   /design/admin/analytics

   FETCHED IN THE BROWSER rather than on the server, unlike its neighbours.
   Every other admin screen renders one shape of one query; this one has a date
   range, and a range that reloads the page loses the scroll position and the
   open table every time somebody compares seven days against thirty — which is
   the only thing anybody does here.
   ========================================================================== */

export const metadata = { title: "Analytics — PageFly Design" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const gate = await adminGate("analytics");
  if (gate) return gate;

  return (
    <AdminShell current="analytics" title="Analytics">
      <AnalyticsView />
    </AdminShell>
  );
}
