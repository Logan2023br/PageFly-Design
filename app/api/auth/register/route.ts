import { z } from "zod";
import { findAllowedStore } from "@/lib/account";
import { MissingDatabaseError, getRepo } from "@/lib/db";
import { REGISTER_USER_TYPE } from "@/lib/db/types";
import { normalizeDomain } from "@/lib/sheet";

/* ==========================================================================
   POST /api/auth/register   a merchant asks for an account

   THE FOURTH DOOR, and like the other three the rule is written on the door
   rather than inferred from the caller:

     /api/auth/store      the beta gate. Admits a store already on the list and
                          refuses everything else. Must stay refusable.
     /api/auth/provision  a link WE signed. May create the store, then signs
                          the merchant in. The signature is the whole gate.
     /api/auth/admin      the operator's.
     this one             a merchant fills in a form. Creates a row and stops.

   IT DOES NOT SIGN ANYBODY IN, and that is the point rather than an omission.
   Registering and signing in are two acts here: this writes the row, the
   merchant goes back to the form, and `/api/auth/store` admits them because
   the row now exists. Setting a cookie here would make the beta gate
   bypassable by anyone who can type a domain — the gate would still be there,
   with a second entrance beside it.

   THERE IS NO SIGNATURE ON THIS ONE. `provision` has one because an invite is
   a key; this is a public form, so anyone can call it and each call costs a
   row with three pages on it. That is the specified design and it is the
   deliberate cost of a self-service beta, but it is the thing to look at first
   the day the page count is higher than the merchant count.
   ========================================================================== */

export const dynamic = "force-dynamic";

/** What a self-registered store gets. The same three an invite gets, for the
    same reason: it is a trial, and an operator raises it in admin once the
    merchant turns out to be real. */
const REGISTER_PAGE_LIMIT = 3;

const bodySchema = z.object({
  domain: z.string().min(3).max(255),
  name: z.string().min(1).max(255),
  email: z.string().min(3).max(255),
});

export type RegisterResponse =
  | { ok: true; domain: string }
  | { ok: false; error: string; hint?: string };

function bad(error: string, hint?: string, status = 400) {
  return Response.json(
    { ok: false, error, ...(hint ? { hint } : {}) } satisfies RegisterResponse,
    { status },
  );
}

export async function POST(request: Request) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return bad("Fill in every field.");
  }

  /* Normalised the same way the sign-in route normalises it, and for the same
     reason: a merchant who pastes `https://Shop.myshopify.com/` and one who
     types `shop.myshopify.com` are the same store, and registering under two
     spellings would make two rows where the second can never sign in. */
  const domain = normalizeDomain(parsed.domain);
  if (!domain.includes("."))
    return bad("That does not look like a store domain.", "It usually ends in .myshopify.com");

  const name = parsed.name.trim();
  if (!name) return bad("Enter the store name.");

  const email = parsed.email.trim();
  /* Deliberately loose. The point is to catch a merchant who typed their
     domain into the email box, not to adjudicate RFC 5322 — a regex strict
     enough to argue with is a regex that rejects somebody's real address. */
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return bad("That does not look like an email address.");

  const repo = getRepo();

  let existing;
  try {
    /* `findAllowedStore` rather than `getStore`: a domain in the compiled-in
       list is already a store even with no row of its own, and telling that
       merchant "you are new" would create a duplicate for a store that can
       already sign in. */
    existing = await findAllowedStore(domain).catch(() => null);
    /* Checked separately because `findAllowedStore` answers null for a blocked
       store — the same null a brand-new domain gets. Without this the form
       would happily create a fresh row for a store whose access was taken
       away, which is the one thing the tombstone exists to prevent. */
    const row = await repo.getStore(domain);
    if (row?.blocked)
      return bad("This store no longer has access.", undefined, 403);
  } catch (err) {
    if (err instanceof MissingDatabaseError)
      return bad(
        "This deployment is not finished being set up.",
        (err as Error).message,
        503,
      );
    return bad(
      "Could not reach the store list right now. Try again in a moment.",
      undefined,
      503,
    );
  }

  /* AN EXISTING STORE IS NOT TOUCHED — the rule `provision` already follows,
     and it matters more here because this form is public. Overwriting would
     mean anyone who knows a domain can reset that store's name, its email and
     the page limit an operator raised by hand. So the answer is "you already
     have one", and nothing is written. */
  if (existing)
    return Response.json(
      {
        ok: false,
        error: "This store is already registered.",
        hint: "Sign in with your store domain.",
      } satisfies RegisterResponse,
      { status: 409 },
    );

  try {
    await repo.upsertStores([
      {
        domain,
        email,
        storeName: name,
        shopifyPlan: null,
        currentPlan: null,
        daysUsed: null,
        country: null,
        userType: REGISTER_USER_TYPE,
        status: "Đang sử dụng",
        pageLimit: REGISTER_PAGE_LIMIT,
        /* Both null on purpose. They record when the store was actually SEEN,
           and `markSignedIn` fills them at the first real sign-in. Stamping
           them here would report a store as active that has never opened the
           app. */
        firstSeenAt: null,
        lastSeenAt: null,
        blocked: false,
      },
    ]);
  } catch (err) {
    return bad("Could not save the registration.", (err as Error).message, 500);
  }

  return Response.json({ ok: true, domain } satisfies RegisterResponse);
}
