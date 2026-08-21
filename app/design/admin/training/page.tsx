import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminShell } from "@/components/admin/AdminShell";
import { TrainingTabs } from "@/components/admin/TrainingTabs";
import { getRepo } from "@/lib/db";
import { readAdminSession } from "@/lib/session";

/* ==========================================================================
   /design/admin/training

   Read on the server like the other admin screens — the route already holds the
   session, so fetching our own API from the client would only add a round trip
   and an empty first paint.
   ========================================================================== */

export const metadata = { title: "Training Design — PageFly Design Admin" };
export const dynamic = "force-dynamic";

export default async function AdminTrainingPage() {
  if (!(await readAdminSession())) return <AdminLogin />;

  /* An unreachable database should not be a crashed screen: the operator can
     still see where they are and what this is for. */
  /* Covers and counts, never the whole set — see lib/db/types.ts. */
  const repo = getRepo();
  const [items, sections] = await Promise.all([
    repo.listTrainingItems().catch(() => []),
    repo.listTrainingSections().catch(() => []),
  ]);

  return (
    <AdminShell
      current="training"
      title="Training Design"
      subtitle="Reference pages filed by industry, and reference sections filed by PageFly element"
    >
      <TrainingTabs templates={items} sections={sections} />
    </AdminShell>
  );
}
