import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminShell } from "@/components/admin/AdminShell";
import { AnalyticsView } from "@/components/admin/AnalyticsView";
import { readAdminSession } from "@/lib/session";

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
  if (!(await readAdminSession())) return <AdminLogin />;

  return (
    <AdminShell current="analytics" title="Analytics">
      <AnalyticsView />
    </AdminShell>
  );
}
