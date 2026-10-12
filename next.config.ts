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
  /* Upsell Build Pages lives with the rest of admin under /design/admin; the
     links the Builder and Slack hand out use the shorter /admin/upsell. */
  async redirects() {
    return [
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
