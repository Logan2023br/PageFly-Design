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

/** The names are in one place, so the link and the code that reads it agree. */
export const LOGIN_PARAM = "login";
const NAME_PARAM = "name";
const EMAIL_PARAM = "email";
const TOKEN_PARAM = "t";

/**
 * An INVITE link — one that may create the store it names.
 *
 * Distinct from a plain `?login=` link, and the distinction is the point: that
 * one signs a merchant into a store already on the beta list and is untouched
 * by any of this. An invite carries a signature as well, and only a signature
 * lets a store be created — so a URL missing `t` is not an invite, however
 * many other parameters it has.
 *
 * `name` and `email` are optional: they only fill in a store that turns out
 * not to exist, and a link without them still opens the one it names.
 */
export type Invite = {
  domain: string;
  token: string;
  name: string;
  email: string;
};

export function inviteParams(search: string): Invite | null {
  const q = new URLSearchParams(search);
  const domain = q.get(LOGIN_PARAM)?.trim();
  const token = q.get(TOKEN_PARAM)?.trim();
  if (!domain || !token) return null;
  return {
    domain,
    token,
    name: q.get(NAME_PARAM)?.trim() ?? "",
    email: q.get(EMAIL_PARAM)?.trim() ?? "",
  };
}

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

/**
 * The same URL with every invite parameter gone, path and fragment intact.
 *
 * All four, not just `login`. The signature is the credential of the pair, and
 * leaving it in the address bar to reach history and the Referer header would
 * defeat the reason the domain is stripped at all.
 */
export function cleanedUrl(href: string): string {
  const url = new URL(href);
  for (const p of [LOGIN_PARAM, NAME_PARAM, EMAIL_PARAM, TOKEN_PARAM])
    url.searchParams.delete(p);
  return url.toString();
}
