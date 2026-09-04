/* ==========================================================================
   The ?login= link.

   /?login=their-store.myshopify.com signs a merchant in and drops them on the
   brief, instead of showing them a form asking for the domain we already put
   in the link. It is the same door the form uses — `POST /api/auth/store`,
   which is the only place in this app allowed to say yes to a sign-in — with
   the typing already done.

   NOTHING HERE VALIDATES OR NORMALISES THE DOMAIN, on purpose. That rule lives
   in `normalizeDomain` and in the allowlist check behind that route, and both
   are server-only. A copy of them here would be a second answer to a question
   that already has one, and the copy would be the one nobody remembers to
   update. This file answers one question — does this URL carry a sign-in
   attempt — and hands the string on exactly as it arrived.

   WHY THE PARAMETER IS REMOVED IMMEDIATELY. For as long as it sits in the
   address bar it is a credential in a URL: it reaches browser history, the
   Referer header of the next request, CDN and proxy logs, and analytics.
   Nothing can unsend those, so the window is closed before the sign-in is even
   answered rather than after.

   Client-safe by construction: no `server-only` import, and no `window` —
   both functions take their input as an argument so they can be tested without
   a browser.
   ========================================================================== */

/** The name is in one place, so the link and the code that reads it agree. */
export const LOGIN_PARAM = "login";

/**
 * The store domain a link is asking to sign in as, or null.
 *
 * Trimmed only. A URL carrying two of them is malformed however it is read, so
 * the first wins — which is what `URLSearchParams.get` already does, and the
 * only reading that is not a guess.
 */
export function loginParam(search: string): string | null {
  const value = new URLSearchParams(search).get(LOGIN_PARAM)?.trim();
  return value ? value : null;
}

/** The same URL with every copy of the parameter gone, path and fragment intact. */
export function cleanedUrl(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(LOGIN_PARAM);
  return url.toString();
}
