import Link from "next/link";
import { CheckoutForm } from "@/components/collection-pages/CheckoutForm";
import { CollectionShell } from "@/components/collection-pages/Shell";
import { toPublicSet } from "@/lib/collectionPages";
import { getRepo } from "@/lib/db";

/* ==========================================================================
   /collection-pages/checkout?set=<slug>

   A static segment, so it wins over `[set]` — which is why `checkout` is a
   reserved set URL. Not a payment: the buyer leaves their store, name and
   email, and the order waits in admin for somebody to check it and write back.
   ========================================================================== */

export const metadata = { title: "Checkout — PageFly Design" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage(props: PageProps<"/collection-pages/checkout">) {
  const { set: raw, request } = await props.searchParams;
  if (request === "custom") {
    return (
      <CollectionShell>
        <CheckoutForm set={null} />
      </CollectionShell>
    );
  }
  const slug = Array.isArray(raw) ? raw[0] : raw;
  const record = slug ? await getRepo().getCollectionSetBySlug(slug).catch(() => null) : null;

  if (!record || !record.visible || record.access !== "paid") {
    return (
      <CollectionShell>
        <div className="mx-auto grid max-w-[520px] justify-items-center gap-3 py-16 text-center">
          <h1 className="font-display text-[26px] font-bold text-pf-text">This set is not for sale</h1>
          <p className="text-[15px] text-pf-muted">
            It may have been taken down, or it is free to download already.
          </p>
          <Link
            href="/collection-pages"
            className="mt-2 inline-flex items-center gap-2 rounded-pf-md bg-pf-primary px-5 py-2.5 text-[14px] font-semibold text-white shadow-pf-button hover:bg-pf-primary-hi"
          >
            See all sets
          </Link>
        </div>
      </CollectionShell>
    );
  }

  return (
    <CollectionShell>
      <CheckoutForm set={toPublicSet(record)} />
    </CollectionShell>
  );
}
