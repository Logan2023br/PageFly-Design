import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminGate } from "@/components/admin/adminGate";
import { CollectionSetEditor } from "@/components/admin/collections/CollectionSetEditor";
import { refreshBuiltInPages } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";
import { readAdminSection } from "@/lib/session";

/* /design/admin/collections/<id> — one set's pages, files and settings. */

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/design/admin/collections/[id]">) {
  const { id } = await props.params;
  /* the title is rendered before the gate: a hidden set's name is for admins only */
  const set = (await readAdminSection("collections")) ? await getRepo().getCollectionSet(id).catch(() => null) : null;
  return { title: `${set?.name ?? "Set"} — Collection pages — PageFly Design Admin` };
}

export default async function AdminCollectionSetPage(props: PageProps<"/design/admin/collections/[id]">) {
  const gate = await adminGate("collections");
  if (gate) return gate;
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
