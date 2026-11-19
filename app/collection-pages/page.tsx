import { CollectionShell } from "@/components/collection-pages/Shell";
import { SetList } from "@/components/collection-pages/SetList";
import { visiblePublicSets } from "@/lib/collectionLanguage";

/* /collection-pages — every visible set, in the order admin gave them, with a
   search, a language filter and the Japanese sets up front.
   Public: deliberately outside `proxy.ts`'s matcher. Read per request, so a
   set switched on in admin is here on the next load. */
export const metadata = {
  title: "Collection pages — PageFly Design",
  description: "Free page sets for PageFly, one store each — in English, Japanese, Chinese, Arabic and more. Download a whole set in one file.",
  alternates: { languages: { ja: "/collection-pages/ja" } },
};
export const dynamic = "force-dynamic";

export default async function CollectionPagesPage() {
  const shown = await visiblePublicSets();
  return (
    <CollectionShell>
      <SetList sets={shown} />
    </CollectionShell>
  );
}
