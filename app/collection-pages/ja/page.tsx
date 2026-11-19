import type { Metadata } from "next";
import { CollectionShell } from "@/components/collection-pages/Shell";
import { JapanSets } from "@/components/collection-pages/JapanSets";
import { visiblePublicSets } from "@/lib/collectionLanguage";

/* /collection-pages/ja — the Japanese sets, in Japanese. A static segment, so
   it is matched before /collection-pages/[set]; no set may take the slug "ja". */
export const metadata: Metadata = {
  title: "日本向け無料ページセット — PageFly Design",
  description:
    "日本のストアのための無料ページセット。すべて日本語・1セット7ページ。1ファイルでダウンロードして PageFly にそのままインポートできます。",
  alternates: { canonical: "/collection-pages/ja", languages: { en: "/collection-pages" } },
};
export const dynamic = "force-dynamic";

export default async function JapanCollectionPages() {
  const sets = (await visiblePublicSets()).filter((s) => s.lang === "ja" && s.access === "free");
  return (
    <CollectionShell current="ja">
      <div lang="ja">
        <JapanSets sets={sets} />
      </div>
    </CollectionShell>
  );
}
