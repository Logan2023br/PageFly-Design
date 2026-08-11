"use client";

import type { PageMockup } from "@/lib/generate/types";

/* ==========================================================================
   Who took the photographs.

   Not decoration and not optional. The stock library's API is free on terms,
   and the terms are a prominent link back to it plus the photographer named
   where possible. Using the API without this is using it outside the licence
   that makes it free.

   It sits below the deck rather than under each image on purpose: a credit
   stamped into every mockup would be shown to the merchant as part of the page
   they are judging, and it is not part of their page. It belongs to the app.

   Renders nothing when no photograph came from the library — a deterministic
   deck has nothing to credit, and an empty rule under it would be noise.
   ========================================================================== */

export function PhotoCredits({ pages }: { pages: PageMockup[] }) {
  /* One entry per photographer across the whole deck. Four pages using the
     same person's work name them once. */
  const byName = new Map<string, string>();
  for (const page of pages)
    for (const credit of page.design?.credits ?? [])
      if (credit.name && !byName.has(credit.name))
        byName.set(credit.name, credit.link);

  const people = [...byName];
  if (people.length === 0) return null;

  return (
    <div className="border-t border-pf-border pb-10 pt-5 text-[12px] leading-relaxed text-pf-faint">
      <p>
        Photos provided by{" "}
        <a
          href="https://www.pexels.com"
          target="_blank"
          rel="noreferrer noopener"
          className="text-pf-body underline decoration-pf-border underline-offset-2 transition-colors hover:text-pf-text"
        >
          Pexels
        </a>
        {" — placeholders only. Replace them with your own product photography "}
        {"before you publish."}
      </p>
      <p className="mt-1.5">
        {people.map(([name, link], i) => (
          <span key={name}>
            {i > 0 && <span className="text-pf-border"> · </span>}
            <a
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              className="transition-colors hover:text-pf-body"
            >
              {name}
            </a>
          </span>
        ))}
      </p>
    </div>
  );
}
