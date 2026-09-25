import { normalizeDomain } from "../sheet";

/* ==========================================================================
   WHOSE FILE IS THIS, AND WHO MAY ASK FOR IT.

   A built `.pagefly` is stored under `(domain, key)`, and the key is a hash of
   the document. Not guessable is not an access rule, so the domain is decided
   here rather than taken from whoever asked.

   This exists because of two opposite failures. An operator looking at a store
   has no MERCHANT session, and the lookup used exactly that — so every export
   from the admin fell past the stored file into a fresh conversion: two
   minutes and about twenty cents of model time per click, thrown away again
   each time. Letting a domain be named fixes that and immediately raises the
   other half: the naming must do nothing at all for anyone who is not an
   operator, and that is a rule which can only ever fail silently, because the
   file downloads either way.
   ========================================================================== */

/**
 * The store whose files this request may read, or null.
 *
 * THE MERCHANT SESSION WINS when both are present. An operator signed in as a
 * merchant too is a real state — testing with their own store — and the
 * narrower claim is the safer one to honour: a slip in the admin UI cannot
 * then read another store through a session that is already scoped.
 */
export function ownerFor(opts: {
  /** the signed-in merchant's domain, if there is one */
  session: string | null;
  /** an admin session is present */
  admin: boolean;
  /** a domain named by the caller — meaningful only to an operator */
  asked: string | null;
}): string | null {
  if (opts.session) return normalizeDomain(opts.session);
  if (!opts.admin) return null;

  const asked = (opts.asked ?? "").trim();
  return asked ? normalizeDomain(asked) : null;
}
