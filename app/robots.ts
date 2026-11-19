import type { MetadataRoute } from "next";

const BASE = (process.env.PFD_PUBLIC_URL?.trim() || "https://pagefly-design.pagefly.io").replace(/\/$/, "");

/* /robots.txt — the public pages are open; admin, the app and the API are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/design", "/api/admin/", "/customer-feedback", "/upsell/"] },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
