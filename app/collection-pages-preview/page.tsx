import { CollectionShell } from "@/components/collection-pages/Shell";
import { SetList } from "@/components/collection-pages/SetList";
import { toPublicSet } from "@/lib/collectionPages";
import { collectionStats, refreshBuiltInPages } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";

/* /collection-pages-preview — /collection-pages for the sets admin has set to
   "Visible preview": the same cards, in the same order, so a set is judged
   exactly as it will look before it is switched to Visible. Public like the
   real page; a preview set's own page and files open for anyone with the link.
   Kept out of search results, since it is a staging list. */
export const metadata = {
  title: "Collection pages preview — PageFly Design",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function CollectionPagesPreviewPage() {
  await refreshBuiltInPages();
  const [sets, stats] = await Promise.all([
    getRepo().listCollectionSets().catch(() => []),
    collectionStats(),
  ]);
  const shown = sets
    .filter((s) => s.visibility === "preview")
    .map((s) => toPublicSet(s, stats))
    .filter((s) => s.pages.length > 0);

  return (
    <CollectionShell>
      <SetList sets={shown} preview />
    </CollectionShell>
  );
}
