import { z } from "zod";
import { findAllowedStore } from "@/lib/account";
import { builtinStores } from "@/lib/allowlist";
import { MissingDatabaseError, getRepo } from "@/lib/db";
import {
  MissingSecretError,
  clearStoreSession,
  setStoreSession,
} from "@/lib/session";
import { normalizeDomain, sheetSource } from "@/lib/sheet";
import { storeExists } from "@/lib/storeExists";
import { NO_REGISTER_USER_TYPE } from "@/lib/db/types";
import { trackServer } from "@/lib/analyticsServer";
import { EV } from "@/lib/analytics";

/* ==========================================================================
   POST /api/auth/store   sign in with a store domain
   DELETE                 sign out

   The allowlist decision happens here and nowhere else, so there is exactly one
   place that can say yes to a store that is already on the list.

   THERE IS A SECOND DOOR, and it is not this one. `/api/auth/provision` opens
   a signed invite link, and it may CREATE the store before admitting it.

   ==========================================================================
   AND THIS DOOR NOW OPENS FOR A STORE IT HAS NEVER SEEN.

   It used to refuse an unknown domain outright and point at a register form on
   another screen. The month that was measured: thirty-one merchants turned
   away, ten followed the link, four finished. Twenty-seven real stores gone,
   and only one of the forty-six attempts was a malformed domain — the traffic
   was right, the door was not.

   So an unknown domain is now ASKED ABOUT rather than refused. `storeExists`
   puts the question to Shopify, and a store that answers gets an email box and
   a way in. What is created is deliberately thin: the domain as typed, a name
   off that domain, the email, three pages, and `Marketing/No Register` so every
   row that came in this way can be told from one that did not.

   THE GATE IS STILL A GATE. `blocked` still refuses, a domain Shopify does not
   know still refuses, and an existing row is still the authority on what a
   store is allowed — none of that moved. What changed is that "we have not
   heard of you" stopped being a final answer.
   ========================================================================== */

const bodySchema = z.object({
  domain: z.string().min(3).max(255),
  /* Absent on the first press. The form only learns an email is wanted from
     this route's own `needs_email` answer, so asking for one up front would put
     a box on screen for the merchants who never need it. */
  email: z.string().max(320).optional(),
});

/** Three pages, the same allowance the register form grants. One number in one
    place would be better; it lives there because that route had it first. */
const NO_REGISTER_PAGE_LIMIT = 3;

/** Deliberately loose. This is a contact address, not a credential — nothing is
    sent to it at sign-in and nothing depends on it resolving. A stricter rule
    rejects real addresses and buys nothing. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The name a store gets when nobody has typed one.
 *
 * The first label of whatever they entered: `logan.myshopify.com` and
 * `logan.com` both become `logan`. Shopify's own `name` is available and is
 * often better, but it is `My Store` on every store that has not been renamed —
 * and a table full of `My Store` names nothing at all.
 */
function nameFromDomain(domain: string): string {
  return domain.split(".")[0] || domain;
}

export type StoreAuthResponse =
  | { ok: true; domain: string; storeName: string | null }
  /* NOT AN ERROR, AND IT MUST NOT READ AS ONE. The store is real and the
     merchant is getting in; the form has one more box to draw first. Given its
     own flag rather than an error string so the screen cannot mistake the two —
     the previous version of this door turned "we have not heard of you" into a
     red message and lost twenty-seven merchants to it. */
  | { ok: false; needsEmail: true; domain: string; storeName: string | null }
  | { ok: false; error: string; hint?: string };

export async function POST(request: Request) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      { ok: false, error: "Enter your store domain." } satisfies StoreAuthResponse,
      { status: 400 },
    );
  }

  const domain = normalizeDomain(parsed.domain);
  if (!domain.includes(".")) {
    return Response.json(
      {
        ok: false,
        error: "That does not look like a store domain.",
        hint: "It usually ends in .myshopify.com",
      } satisfies StoreAuthResponse,
      { status: 400 },
    );
  }

  let store;
  try {
    store = await findAllowedStore(domain);
  } catch (err) {
    /* Missing configuration is permanent: "try again in a moment" sends an
       operator away to wait for something that will never resolve on its own. It
       gets its own message naming the variable to set. */
    if (err instanceof MissingSecretError || err instanceof MissingDatabaseError) {
      return Response.json(
        {
          ok: false,
          error: "This deployment is not finished being set up.",
          hint: err.message,
        } satisfies StoreAuthResponse,
        { status: 503 },
      );
    }
    /* A genuinely transient storage or sheet failure. It must not read as "not
       allowed" — that would tell an allowed merchant they are barred because a
       database blipped. */
    return Response.json(
      {
        ok: false,
        error: "Could not check the store list right now. Try again in a moment.",
      } satisfies StoreAuthResponse,
      { status: 503 },
    );
  }

  if (!store) {
    /* The configuration hint belongs only in the case it explains: an EMPTY
       allowlist with no source. Showing it whenever no source is configured
       told an operator their sheet was missing while a pushed list sat in the
       database working fine. */
    /* "Nothing is loaded" has to count the compiled-in list too. Without that it
       told an operator to configure a sheet while a working built-in list was
       admitting people — the same wrong diagnosis as before, one layer down. */
    const empty =
      sheetSource() === "none" &&
      builtinStores().length === 0 &&
      (await getRepo().listStoreSummaries().catch(() => [])).length === 0;

    /* An operator with nothing loaded is a different problem from a merchant
       with no row, and only one of them can be fixed from this screen. Kept
       ahead of the Shopify check so a broken deployment is named rather than
       quietly admitting everybody. */
    if (empty)
      return Response.json(
        {
          ok: false,
          error: "This deployment has no store list yet.",
          hint: "See README (SHEET_SERVICE_ACCOUNT_JSON or /api/admin/sync).",
        } satisfies StoreAuthResponse,
        { status: 503 },
      );

    /* ======================================================================
       A BLOCK IS NOT AN ABSENCE, AND `findAllowedStore` CANNOT TELL YOU WHICH.

       It answers null for a store nobody knows AND for one an operator has
       removed, so everything below this point would treat a barred domain as a
       new one: verify it, take an email, and upsert over the operator's row
       with three pages and a new type. The block itself would hold — the driver
       preserves the flag — but the record of what was blocked would not.

       Read the row directly. A blocked store is refused here and goes no
       further, with the same message an unknown one used to get: a barred
       merchant learning they are barred is not information this door owes.
       ====================================================================== */
    const barred = await getRepo()
      .getStore(domain)
      .catch(() => null);
    if (barred?.blocked)
      return Response.json(
        {
          ok: false,
          error: "This store has not been registered yet.",
          hint: "Contact support if you think this is wrong.",
        } satisfies StoreAuthResponse,
        { status: 403 },
      );

    /* ======================================================================
       NOT ON THE LIST — SO ASK SHOPIFY RATHER THAN REFUSE.

       `no` is the only refusal left here, and it is Shopify's word rather than
       ours: the domain does not resolve, or it resolves to something that is
       not a shop. `unknown` — a rate limit, a timeout — is let through on
       purpose. Shopify being busy is not a merchant without a store, and the
       cost of the two mistakes is not symmetric: a wrong row can be deleted, a
       merchant sent away does not come back.
       ====================================================================== */
    const exists = await storeExists(domain);

    if (exists.status === "no")
      return Response.json(
        {
          ok: false,
          error: "We could not find a Shopify store at that address.",
          hint: "Check the spelling, or use your .myshopify.com address.",
        } satisfies StoreAuthResponse,
        { status: 404 },
      );

    /* The store is real. The email is the one thing still wanted, and the form
       has not been told to ask for it yet. */
    const email = (parsed.email ?? "").trim().toLowerCase();
    if (!email)
      return Response.json(
        {
          ok: false,
          needsEmail: true,
          domain,
          storeName: exists.name ?? null,
        } satisfies StoreAuthResponse,
        { status: 200 },
      );

    if (!EMAIL.test(email))
      return Response.json(
        {
          ok: false,
          needsEmail: true,
          domain,
          storeName: exists.name ?? null,
        } satisfies StoreAuthResponse,
        { status: 200 },
      );

    /* THE DOMAIN AS TYPED IS THE KEY. Shopify hands back a canonical
       `myshopify_domain` for a custom domain, and using it would keep one row
       per store — but it would also mean a merchant signs in at `adbv.com` and
       finds a row named something they have never seen. The address they use is
       the address they get. */
    try {
      await getRepo().upsertStores([
        {
          domain,
          email,
          storeName: nameFromDomain(domain),
          shopifyPlan: null,
          currentPlan: null,
          daysUsed: null,
          country: exists.country ?? null,
          userType: NO_REGISTER_USER_TYPE,
          status: "Đang sử dụng",
          pageLimit: NO_REGISTER_PAGE_LIMIT,
          /* `markSignedIn` below fills these. Stamping them here would be the
             same clock twice and would report a store as seen before it was. */
          firstSeenAt: null,
          lastSeenAt: null,
          blocked: false,
        },
      ]);
    } catch (err) {
      return Response.json(
        {
          ok: false,
          error: "Could not create the account.",
          hint: (err as Error).message,
        } satisfies StoreAuthResponse,
        { status: 500 },
      );
    }

    store = await findAllowedStore(domain);
    if (!store)
      return Response.json(
        { ok: false, error: "Could not create the account." } satisfies StoreAuthResponse,
        { status: 500 },
      );

    /* Counted from the server so it carries the domain — at this moment there
       is still no session for `/api/events` to stamp one from. Best effort: a
       missed count must never cost a merchant their sign-in. */
    await trackServer(
      EV.loginNoRegister,
      { verified: exists.status, products: exists.products ?? null },
      domain,
    ).catch(() => {});
  }

  /* Wrapped because it was not: an exception here escaped as a 500 with an HTML
     body, the browser's res.json() threw on it, and the form reported "could not
     reach the server" for a server that had answered. */
  try {
    await setStoreSession(store.domain);
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: "Could not start a session.",
        hint: (err as Error).message,
      } satisfies StoreAuthResponse,
      { status: 500 },
    );
  }

  /* Best effort. Recording the sign-in time is bookkeeping — a storage hiccup
     must not turn a successful sign-in into a failure. */
  await getRepo()
    .markSignedIn(store.domain, new Date())
    .catch(() => {});

  return Response.json({
    ok: true,
    domain: store.domain,
    storeName: store.storeName,
  } satisfies StoreAuthResponse);
}

export async function DELETE() {
  await clearStoreSession();
  return Response.json({ ok: true });
}
