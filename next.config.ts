import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile in the home directory makes Next infer the wrong
  // workspace root; pin it to this project.
  turbopack: {
    root: __dirname,
  },

  /* Next.js 16 blocks cross-origin requests to dev-only assets. Reaching the
     dev server through a tunnel means the HTML renders (200) while every
     /_next/static chunk is refused (403) — so the page looks completely normal
     and nothing on it responds, because React never hydrates.
     Development only; has no effect on `next build`.

     Add your own hostname here if you tunnel through anything else. Note this
     does let any page on the listed domains read your dev assets while the
     tunnel is open, which is the reason the block exists — keep the list to
     what you actually use. */
  /* No "X-Powered-By: Next.js": it tells a scanner which advisories to try. */
  poweredByHeader: false,

  /* ==========================================================================
     SECURITY HEADERS.

     Everywhere: HTTPS only from here on (HSTS), no MIME sniffing, and a
     referrer that never carries a path off the site.

     Admin (pages and API): may only be framed by this site — an admin screen
     inside someone else's page is a clickjacking surface. The rest of the
     site is left frameable on purpose: the PageFly app may open it inside
     the Shopify admin.

     The static sets in public/: uploaded-style HTML served from this origin,
     so it gets the same `sandbox` the collection route gives it — opened
     directly, its scripts run in an opaque origin, not with our cookies.
     ========================================================================== */
  async headers() {
    const frameSelf = [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    ];
    const sandboxed = [{ key: "Content-Security-Policy", value: "sandbox allow-scripts" }];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      { source: "/design/admin", headers: frameSelf },
      { source: "/design/admin/:path*", headers: frameSelf },
      { source: "/admin/:path*", headers: frameSelf },
      { source: "/api/admin/:path*", headers: frameSelf },
      { source: "/collection-sets/:path*", headers: sandboxed },
      { source: "/showcase/:path*", headers: sandboxed },
      { source: "/collections/:path*", headers: sandboxed },
    ];
  },

  /* Upsell Build Pages lives with the rest of admin under /design/admin; the
     links the Builder and Slack hand out use the shorter /admin/upsell. */
  async redirects() {
    return [
      /* The front door and the merchant app both go to /collection-pages, for
         everyone. Exact paths only: /design/login, /design/library and
         /design/admin stay reachable. This also ends /?login= invite links
         and the way back into /design. Temporary (307), not permanent, so a
         browser does not keep it once it is taken out. */
      { source: "/", destination: "/collection-pages", permanent: false },
      { source: "/design", destination: "/collection-pages", permanent: false },
      { source: "/admin/upsell", destination: "/design/admin/upsell", permanent: false },
      { source: "/admin/upsell/:path*", destination: "/design/admin/upsell/:path*", permanent: false },
    ];
  },

  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.app",
    "*.ngrok.io",
    "*.trycloudflare.com",
    "*.loca.lt",
  ],
};

export default nextConfig;
