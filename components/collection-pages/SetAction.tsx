"use client";

import { EV, track } from "@/lib/analytics";
import type { PublicCollectionSet } from "@/lib/collectionPages";
import { Icon } from "../ui";

/* ==========================================================================
   THE ONE BUTTON A SET HAS, and which one it is depends on the set.

   FREE: the whole set as one .pagefly — PageFly's own multi-page export,
   combined on the server — so a merchant imports once rather than seven times.

   PAID: the price, and a link to wherever the sale happens. The file routes
   refuse a paid set, so this is not a hidden download behind a label.
   ========================================================================== */

export function SetAction({
  set,
  size = "sm",
}: {
  set: PublicCollectionSet;
  size?: "sm" | "lg";
}) {
  const cls =
    size === "lg"
      ? "inline-flex min-h-11 items-center gap-2 rounded-pf-md px-5 py-2.5 text-[14px]"
      : "inline-flex items-center gap-1.5 rounded-pf-md px-3 py-2 text-[12.5px]";
  const count = set.pages.length;

  if (set.access === "paid") {
    if (!set.buyUrl) return null;
    return (
      <a
        href={set.buyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`${cls} bg-pf-warn font-semibold text-pf-ink shadow-pf-button transition-opacity hover:opacity-90`}
      >
        <Icon name="ShoppingCart" size={size === "lg" ? 15 : 13} />
        Buy {size === "lg" ? `all ${count} pages` : "set"}
        {set.price ? ` · ${set.price}` : ""}
      </a>
    );
  }

  if (!set.download) return null;
  return (
    <a
      href={set.download}
      download={`${set.id}.pagefly`}
      onClick={() =>
        track(EV.showcaseSetDownloaded, { set: set.id, pages: count, from: "collection_pages" })
      }
      className={`${cls} bg-pf-primary font-semibold text-white shadow-pf-button transition-colors hover:bg-pf-primary-hi`}
    >
      <Icon name="Download" size={size === "lg" ? 15 : 13} />
      {size === "lg" ? `Download free · all ${count} pages` : `Download free · ${count} pages`}
    </a>
  );
}
