import type { MetadataRoute } from "next";
import { visiblePublicSets } from "@/lib/collectionLanguage";

/* /sitemap.xml — the public collection pages, so search engines (and a
   Japanese merchant searching in Japanese) find every visible set. */
export const dynamic = "force-dynamic";

const BASE = (process.env.PFD_PUBLIC_URL?.trim() || "https://pagefly-design.pagefly.io").replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sets = await visiblePublicSets().catch(() => []);
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1 },
    {
      url: `${BASE}/collection-pages`,
      changeFrequency: "daily",
      priority: 0.9,
      alternates: { languages: { ja: `${BASE}/collection-pages/ja` } },
    },
    {
      url: `${BASE}/collection-pages/ja`,
      changeFrequency: "daily",
      priority: 0.9,
      alternates: { languages: { en: `${BASE}/collection-pages` } },
    },
    ...sets.map((s) => ({
      url: `${BASE}/collection-pages/${s.id}`,
      changeFrequency: "weekly" as const,
      priority: s.lang === "ja" ? 0.8 : 0.7,
    })),
  ];
}
