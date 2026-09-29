import { CollectionShell } from "@/components/collection-pages/Shell";
import { SetList } from "@/components/collection-pages/SetList";
import { toPublicSet } from "@/lib/collectionPages";
import { collectionStats } from "@/lib/collectionPagesServer";
import { getRepo } from "@/lib/db";

/* /collection-pages — every visible set, in the order admin gave them.
   Public: deliberately outside `proxy.ts`'s matcher. Read per request, so a
   set switched on in admin is here on the next load. */
export const metadata = { title: "Collection pages — PageFly Design" };
export const dynamic = "force-dynamic";

export default async function CollectionPagesPage() {
  const [sets, stats] = await Promise.all([
    getRepo().listCollectionSets().catch(() => []),
    collectionStats(),
  ]);
  const shown = sets
    .filter((s) => s.visible)
    .map((s) => toPublicSet(s, stats))
    /* A visible set with nothing to preview would be a card that opens onto
       an empty page. */
    .filter((s) => s.pages.length > 0);

  return (
    <CollectionShell>
      <SetList sets={shown} />
    </CollectionShell>
  );
}
