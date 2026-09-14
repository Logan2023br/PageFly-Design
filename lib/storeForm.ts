/* ==========================================================================
   What a store domain and an email have to look like.

   NO `server-only` HERE, and that is the whole reason this file exists rather
   than living in `lib/sheet.ts` with the rest of the domain handling. The
   register form runs in the browser and the register route runs on the server,
   both have to judge the same three fields, and the moment they hold separate
   copies of the rule they start disagreeing — a form that rejects what the
   server would have taken, or waves through what it refuses. One
   implementation, imported by both, is the same arrangement `lib/design/derive`
   uses to keep the mockup and the exporter agreeing about a breakpoint.

   The server still has the final say: a browser check is a courtesy to whoever
   is typing, never a gate. The route calls these again on what actually
   arrives.
   ========================================================================== */

/**
 * One spelling of a store domain, out of the many people type.
 *
 * Scheme, `www.`, a path, a trailing dot, capitals, surrounding space — all of
 * it goes, because `HTTPS://Shop.myshopify.com/admin` and `shop.myshopify.com`
 * are one store and two rows for one store is the failure this prevents.
 *
 * LIVES HERE NOW, and `lib/sheet.ts` re-exports it so its own callers are
 * untouched. It moved because the browser needs it too and `sheet.ts` is
 * server-only — importing it from a client component fails the build.
 */
export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, "");
  value = value.replace(/^www\./, "");
  value = value.split(/[/?#]/)[0];
  return value.replace(/\.+$/, "");
}

/**
 * Shopify's own store-domain shape: one label, then `.myshopify.com`.
 *
 * Deliberately narrower than "has a dot in it", which is all the sign-in route
 * asks. Sign-in has to admit whatever is on the beta sheet, and that list was
 * typed by people; this form CREATES the key every other table joins on, so it
 * is the one place the shape can still be insisted on.
 *
 * The rejection that matters is a merchant's own storefront address —
 * `mystore.com`. It is the commonest wrong answer, because the field says
 * "Store domain" and that is the domain they think of. A row created under it
 * is a row that can never sign in and that nothing will ever match.
 */
export const STORE_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** An error and an optional hint, or null when the value is fine. Returning the
    sentence rather than a boolean is what stops the form and the route from
    wording the same refusal two different ways. */
export type FieldProblem = { error: string; hint?: string } | null;

export function storeDomainProblem(raw: string): FieldProblem {
  const domain = normalizeDomain(raw);
  if (!domain) return { error: "Enter your store domain." };

  if (!STORE_DOMAIN.test(domain))
    return {
      error: "That does not look like a Shopify store domain.",
      /* Names the thing they most likely typed. "Invalid format" leaves a
         merchant staring at an address that is, to them, obviously their
         store's. */
      hint: "Use your .myshopify.com address, not your custom domain.",
    };

  return null;
}

/**
 * Deliberately loose, and only as strict as its job.
 *
 * The job is catching someone who put their domain in the email box, or left
 * off the `@`. It is not adjudicating RFC 5322 — a regex strict enough to
 * argue with is a regex that eventually rejects somebody's real address, and
 * the address is confirmed by mail reaching it, never by a pattern.
 */
export function emailProblem(raw: string): FieldProblem {
  const email = raw.trim();
  if (!email) return { error: "Enter your email address." };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return {
      error: "That does not look like an email address.",
      hint: "It needs an @ and a domain after it.",
    };

  return null;
}

export function storeNameProblem(raw: string): FieldProblem {
  return raw.trim() ? null : { error: "Enter the store name." };
}
