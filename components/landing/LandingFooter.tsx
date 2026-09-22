import Link from "next/link";

/* ==========================================================================
   The foot of the public page.

   ONE ROW. A landing page with four links does not need a four-column footer;
   the sitemap shape is for sites with somewhere else to go, and this one has
   exactly one next step, which is already the button above.
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
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-[12.5px] text-pf-faint sm:flex-row">
        <span>PageFly Design · a PageFly product</span>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-pf-text"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
