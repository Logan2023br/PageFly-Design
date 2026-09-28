import { notFound } from "next/navigation";
import { CollectionShell } from "@/components/collection-pages/Shell";
import { SetDetail } from "@/components/collection-pages/SetDetail";
import { toPublicSet } from "@/lib/collectionPages";
import { getRepo } from "@/lib/db";
import { readAdminSession } from "@/lib/session";

/* /collection-pages/<set> — every page of one set; pressing one opens the
   mockup. A hidden set is a 404 to everybody but an admin, who sees it with a
   banner so it can be checked before it is switched on. */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/collection-pages/[set]">) {
  const { set: slug } = await props.params;
  const set = await getRepo().getCollectionSetBySlug(slug).catch(() => null);
  return { title: `${set?.visible ? set.name : "Collection pages"} — PageFly Design` };
}

export default async function CollectionSetPage(props: PageProps<"/collection-pages/[set]">) {
  const { set: slug } = await props.params;
  const repo = getRepo();
  const [record, all] = await Promise.all([
    repo.getCollectionSetBySlug(slug).catch(() => null),
    repo.listCollectionSets().catch(() => []),
  ]);
  if (!record) notFound();
  const preview = !record.visible;
  if (preview && !(await readAdminSession())) notFound();

  const others = all
    .filter((s) => s.visible && s.pages.some((p) => p.htmlSize !== null))
    .map((s) => ({ id: s.slug, name: s.name }));

  return (
    <CollectionShell>
      <SetDetail set={toPublicSet(record)} others={others} preview={preview} />
    </CollectionShell>
  );
}
