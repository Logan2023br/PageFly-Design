import { notFound } from "next/navigation";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminShell } from "@/components/admin/AdminShell";
import { CollectionSetEditor } from "@/components/admin/collections/CollectionSetEditor";
import { refreshBuiltInPages } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";
import { readAdminSession } from "@/lib/session";

/* /design/admin/collections/<id> — one set's pages, files and settings. */

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/design/admin/collections/[id]">) {
  const { id } = await props.params;
  const set = await getRepo().getCollectionSet(id).catch(() => null);
  return { title: `${set?.name ?? "Set"} — Collection pages — PageFly Design Admin` };
}

export default async function AdminCollectionSetPage(props: PageProps<"/design/admin/collections/[id]">) {
  if (!(await readAdminSession())) return <AdminLogin />;
  const { id } = await props.params;
  await refreshBuiltInPages();
  const set = await getRepo().getCollectionSet(id).catch(() => null);
  if (!set) notFound();

  return (
    <AdminShell current="collections" title={set.name} subtitle={`/collection-pages/${set.slug}`}>
      <CollectionSetEditor initial={set} />
    </AdminShell>
  );
}
