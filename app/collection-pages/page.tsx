import { CollectionShell } from "@/components/collection-pages/Shell";
import { SetList } from "@/components/collection-pages/SetList";

/* /collection-pages — every curated page set in `lib/showcasePages.ts`. Public:
   deliberately outside `proxy.ts`'s matcher. */
export const metadata = { title: "Collection pages — PageFly Design" };

export default function CollectionPagesPage() {
  return (
    <CollectionShell>
      <SetList />
    </CollectionShell>
  );
}
