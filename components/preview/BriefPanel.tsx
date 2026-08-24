"use client";

import type { ReactNode } from "react";
import type { Brief } from "@/lib/validation";
import { STORE_TYPES } from "@/lib/briefOptions";
import { VISUAL_STYLES } from "@/lib/styleTokens";
import { describeSelection } from "@/lib/pageCatalog";
import { Icon } from "../ui";

/* ==========================================================================
   The brief, read back beside the page it produced.

   Takes a brief and renders it. It resolves nothing: which brief belongs to
   which page is `briefForPage`'s question, answered before this is called, and
   a component that reached into the store for `brief` would answer it wrongly
   in the Library — see that module.
   ========================================================================== */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] items-start gap-4 py-2.5">
      <dt className="pt-px text-[12px] font-semibold uppercase tracking-wide text-pf-faint">
        {label}
      </dt>
      <dd className="min-w-0 text-[14px] leading-relaxed text-pf-body">{children}</dd>
    </div>
  );
}

export function BriefPanel({ brief }: { brief: Brief | null }) {
  /* Not an error and not empty: the page is real, the brief that made it was
     not kept. Saying so is better than a blank panel, which reads as broken. */
  if (!brief) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <p className="max-w-[42ch] text-[14px] text-pf-muted">
          The brief for this page was not saved with it.
        </p>
      </div>
    );
  }

  const style = VISUAL_STYLES.find((s) => s.id === brief.visualStyle);
  const storeType = STORE_TYPES.find((t) => t.id === brief.storeType);

  return (
    <div className="pfd-scroll-none h-full w-full overflow-y-auto px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-[720px]">
        <h2 className="text-[15px] font-semibold text-pf-text">Brief</h2>
        <p className="mt-1 text-[12.5px] text-pf-faint">
          What this page was built from.
        </p>

        <dl className="mt-5 divide-y divide-pf-border border-y border-pf-border">
          <Row label="Sells">
            {brief.whatYouSell}
            {brief.verticalSlug && (
              <span className="text-pf-faint"> · {brief.verticalSlug}</span>
            )}
          </Row>

          <Row label="Store">{storeType?.label ?? brief.storeType}</Row>

          <Row label="Style">{style?.label ?? brief.visualStyle}</Row>

          <Row label="Pages">{describeSelection(brief.pages)}</Row>

          {brief.brandColors.length > 0 && (
            <Row label="Colors">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {brief.brandColors.map((hex) => (
                  <span key={hex} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-4 shrink-0 rounded-full border border-pf-border"
                      style={{ background: hex }}
                    />
                    <span className="font-mono-pf text-[12.5px] text-pf-muted">
                      {hex}
                    </span>
                  </span>
                ))}
              </div>
            </Row>
          )}

          {brief.prompt.trim() !== "" && (
            <Row label="Prompt">
              <p className="whitespace-pre-wrap">{brief.prompt}</p>
            </Row>
          )}

          {brief.referenceImages.length > 0 && (
            <Row label="References">
              <ReferenceImages images={brief.referenceImages} />
            </Row>
          )}
        </dl>
      </div>
    </div>
  );
}

/* ==========================================================================
   A saved run keeps the NAMES of the reference images and not the pixels.

   `runPayload.ts` blanks `url` and clears `dataUrl` before a run is stored, so
   a deck reopened from the Library has the list and no thumbnails. Rendering an
   <img> with an empty src would give the merchant a row of broken-image icons
   and imply the upload was lost; showing nothing would imply there never was
   one. Neither is true, so the names are shown as names.
   ========================================================================== */

function ReferenceImages({ images }: { images: Brief["referenceImages"] }) {
  return (
    <ul className="flex flex-wrap gap-3">
      {images.map((img) => {
        const src = img.dataUrl || img.url;
        return (
          <li key={img.id}>
            {src ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={src}
                alt={img.name}
                className="size-16 rounded-pf-sm border border-pf-border object-cover"
              />
            ) : (
              <span className="flex items-center gap-1.5 rounded-pf-sm border border-pf-border px-2 py-1.5 text-[12.5px] text-pf-muted">
                <Icon name="Images" size={13} />
                {img.name}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
