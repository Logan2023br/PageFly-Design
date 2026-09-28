import { notFound } from "next/navigation";
import { CollectionShell } from "@/components/collection-pages/Shell";
import { SetDetail } from "@/components/collection-pages/SetDetail";
import { SHOWCASE_SETS } from "@/lib/showcasePages";

/* /collection-pages/<set> — every page of one set; pressing one opens the
   mockup. The sets are a list in the repository, so every route is known at
   build time and anything else is a 404. */
export const dynamicParams = false;

export function generateStaticParams() {
  return SHOWCASE_SETS.map((set) => ({ set: set.id }));
}

export async function generateMetadata(props: PageProps<"/collection-pages/[set]">) {
  const { set: id } = await props.params;
  const set = SHOWCASE_SETS.find((s) => s.id === id);
  return { title: `${set?.name ?? "Collection pages"} — PageFly Design` };
}

export default async function CollectionSetPage(props: PageProps<"/collection-pages/[set]">) {
  const { set: id } = await props.params;
  if (!SHOWCASE_SETS.some((s) => s.id === id)) notFound();
  return (
    <CollectionShell>
      <SetDetail setId={id} />
    </CollectionShell>
  );
}
