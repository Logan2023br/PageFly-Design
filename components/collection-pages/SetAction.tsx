"use client";

import Link from "next/link";
import { useState } from "react";
import { EV, track } from "@/lib/analytics";
import { checkoutUrl, pagesLabel, type PublicCollectionSet } from "@/lib/collectionPages";
import { Icon } from "../ui";
import { DownloadGate } from "./DownloadGate";

/* ==========================================================================
   THE ONE BUTTON A SET HAS, and which one it is depends on the set.

   FREE: the whole set as one .pagefly — PageFly's own multi-page export,
   combined on the server — so a merchant imports once rather than seven times.

   PAID: the price, and the way to the checkout form. The file routes refuse a
   paid set, so this is not a hidden download behind a label.
   ========================================================================== */

export function SetAction({
  set,
  size = "sm",
  place,
}: {
  set: PublicCollectionSet;
  size?: "sm" | "lg";
  /** which of the three buttons this is, for the Buy press */
  place: "card" | "detail" | "viewer";
}) {
  const cls =
    size === "lg"
      ? "inline-flex min-h-11 items-center gap-2 rounded-pf-md px-5 py-2.5 text-[14px]"
      : "inline-flex items-center gap-1.5 rounded-pf-md px-3 py-2 text-[12.5px]";
  const count = set.pages.length;

  if (set.access === "paid") {
    return (
      <Link
        href={checkoutUrl(set.id)}
        onClick={() =>
          track(EV.cpBuyClicked, { set: set.id, place, price: set.price ?? "" })
        }
        className={`${cls} bg-pf-warn font-semibold text-pf-ink shadow-pf-button transition-opacity hover:opacity-90`}
      >
        <Icon name="ShoppingCart" size={size === "lg" ? 15 : 13} />
        {set.price ? `Buy for ${set.price}` : "Buy this set"}
        {/* Said on the button, where the price is weighed. */}
        <span className="font-medium opacity-75">(Free edits included)</span>
      </Link>
    );
  }

  if (!set.download) return null;
  return <FreeDownload set={set} cls={cls} size={size} place={place} count={count} />;
}

/* The free button opens the download form rather than handing over the file —
   see `DownloadGate`. Its own component because it holds the open state. */
function FreeDownload({
  set,
  cls,
  size,
  place,
  count,
}: {
  set: PublicCollectionSet;
  cls: string;
  size: "sm" | "lg";
  place: "card" | "detail" | "viewer";
  count: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${cls} bg-pf-primary font-semibold text-white shadow-pf-button transition-colors hover:bg-pf-primary-hi`}
      >
        <Icon name="Download" size={size === "lg" ? 15 : 13} />
        {size === "lg" && count > 1
          ? `Download free · all ${pagesLabel(count)}`
          : `Download free · ${pagesLabel(count)}`}
      </button>
      {open && <DownloadGate set={set} page={null} place={place} onClose={() => setOpen(false)} />}
    </>
  );
}
