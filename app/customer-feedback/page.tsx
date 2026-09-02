import { FeedbackScreen } from "@/components/review/FeedbackScreen";
import { normalizeDomain } from "@/lib/sheet";

/* ==========================================================================
   /customer-feedback?domain=abc.myshopify.com

   The link we send a merchant to ask for a rating. Public: this route is
   deliberately not in `proxy.ts`'s matcher, so it opens for anyone, and it
   reads no session — the whole point is that the merchant does not sign in.

   The domain is normalised HERE as well as in the route handler, so what the
   page shows the merchant is the same string the database is keyed by rather
   than whatever shape the link happened to carry.
   ========================================================================== */

export const metadata = { title: "Your feedback — PageFly Design" };

export default async function CustomerFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string | string[] }>;
}) {
  const { domain } = await searchParams;

  /* A repeated ?domain= arrives as an array. Taking the first is the only
     reading that is not a guess — and a link with two of them is malformed
     however it is resolved. */
  const raw = Array.isArray(domain) ? domain[0] : domain;
  const normalized = raw ? normalizeDomain(raw) : "";

  /* The same test the route handler applies, so a link that cannot possibly be
     accepted says so before the merchant has picked their stars. */
  return (
    <FeedbackScreen domain={normalized.includes(".") ? normalized : null} />
  );
}
