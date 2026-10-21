import type { Metadata } from "next";
import { CrispChat } from "@/components/upsell/CrispChat";
import { NewPageView, PreviewBanner, type PublicDesign } from "@/components/upsell/NewPageView";
import { UpsellShell } from "@/components/upsell/Shell";
import { Unavailable } from "@/components/upsell/Unavailable";
import { access, customerState } from "@/lib/upsell/access";
import { hasUpsellDatabase } from "@/lib/upsell/db";
import { PAGE_LABELS, type PageType } from "@/lib/upsell/types";

/* ==========================================================================
   /new-page?id=XXXXXXXX — the customer's two pages.

   Public and outside proxy.ts's matcher. Who sees what is decided by
   `access()`: the customer once the lead is sent and until the link
   expires; a signed-in admin always, with a banner while the customer does
   not have it yet. Everyone else gets the same "not found" whether the id
   is wrong or merely not sent — the page does not confirm it exists.

   Only safe fields cross into the client component. Email and phone are on
   the lead row this reads, and stop here.
   ========================================================================== */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your 2 pages — PageFly",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default async function NewPage(props: PageProps<"/new-page">) {
  const sp = await props.searchParams;
  const id = (typeof sp.id === "string" ? sp.id : "").trim().toUpperCase();
  const v = Number(typeof sp.v === "string" ? sp.v : NaN);

  const a = id && hasUpsellDatabase() ? await access(id, null, Number.isInteger(v) && v > 0 ? v : undefined).catch(() => null) : null;

  if (!a || !a.ok) {
    const reason = a && !a.ok && (a.reason === "expired" || a.reason === "rejected") ? a.reason : "missing";
    return (
      <UpsellShell>
        <CrispChat designId={id || null} />
        <Unavailable reason={reason} />
      </UpsellShell>
    );
  }

  const { view, viewer } = a;
  const lead = view.lead;
  const handle = lead.store_domain.replace(/\.myshopify\.com$/i, "");
  const state = customerState(view);
  const olderVersion = view.pages[0] && view.pages[0].version !== view.design.version ? view.pages[0].version : null;

  const design: PublicDesign = {
    id: view.design.id,
    leadId: lead.lead_id,
    storeName: lead.store_name?.trim() || handle,
    storeDomain: lead.store_domain,
    handle,
    expiresAt: view.design.expires_at,
    preview: viewer !== "customer" && state !== "ok",
    version: olderVersion,
    sample: view.design.sample === true,
    pages: view.pages.map((p) => ({
      slot: p.slot,
      type: p.type,
      label: PAGE_LABELS[p.type as PageType] ?? `${p.type} page`,
      title: p.title,
      version: p.version,
    })),
  };

  if (design.pages.length === 0 || state === "purged") {
    return (
      <UpsellShell>
        <CrispChat storeDomain={lead.store_domain} leadId={lead.lead_id} designId={design.id} />
        <Unavailable reason="expired" />
      </UpsellShell>
    );
  }

  return (
    <UpsellShell banner={design.preview || olderVersion ? <PreviewBanner version={olderVersion} state={state} /> : null}>
      <CrispChat storeDomain={lead.store_domain} leadId={lead.lead_id} designId={design.id} />
      <NewPageView design={design} />
    </UpsellShell>
  );
}
