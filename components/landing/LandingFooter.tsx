"use client";

import Image from "next/image";
import { EV, track } from "@/lib/analytics";

/* ==========================================================================
   The foot of the public page.

   ONE ROW. A landing page with four links does not need a four-column footer;
   the sitemap shape is for sites with somewhere else to go, and this one has
   exactly one next step, which is already the button above.

   THE LINKS REPORT, AND UNDER THEIR OWN NAME. Every one of them leaves for
   another site, and counted as `ctaClicked` a good week of people reading the
   help centre would read as a good week of conversion — see the note beside
   `landingLinkClicked`.

   A PLAIN `<a>`, NOT `next/link`. All four leave this app entirely, so there is
   no client-side route to prefetch and nothing for the router to do; `Link`
   here is a prefetch of somebody else's homepage.
   ========================================================================== */
const LINKS: { label: string; href: string }[] = [
  { label: "PageFly", href: "https://pagefly.io" },
  { label: "Help center", href: "https://help.pagefly.io" },
  { label: "Privacy", href: "https://pagefly.io/pages/privacy-policy" },
  { label: "Terms", href: "https://pagefly.io/pages/terms-of-service" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-pf-border">
      {/* FULL BLEED, like the masthead it bookends — see the note there. */}
      <div className="flex flex-col items-center justify-between gap-5 px-5 py-8 text-[13px] text-pf-faint sm:px-8 lg:h-24 lg:flex-row lg:gap-4 lg:px-[120px] lg:py-0">
        <div className="flex items-center gap-2.5">
          <Image
            src="/pagefly-icon.png"
            alt=""
            width={22}
            height={22}
            className="size-[22px] rounded-[6px]"
          />
          <span>PageFly Design · a PageFly product</span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => track(EV.landingLinkClicked, { to: l.label, where: "footer" })}
              className="text-pf-muted transition-colors hover:text-pf-text"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
