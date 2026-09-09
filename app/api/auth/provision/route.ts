import { z } from "zod";
import { findAllowedStore } from "@/lib/account";
import { getRepo } from "@/lib/db";
import { normalizeDomain } from "@/lib/sheet";
import {
  MissingSecretError,
  setStoreSession,
  verifyInvite,
} from "@/lib/session";

/* ==========================================================================
   POST /api/auth/provision   open an invite link

   The second door, and it is deliberately not the first one.

   `/api/auth/store` admits a store that is already on the list and refuses
   everything else — that is the beta gate, and nothing here changes it. This
   route is for a link WE issued: it creates the store when it does not exist
   yet, then signs the merchant in. Two doors, two rules, and the rule is
   written on the door rather than inferred from the caller.

   THE SIGNATURE IS THE WHOLE GATE. Without it this endpoint would let anyone
   who guessed the URL shape mint a store and spend its page allowance — every
   build costs real money. `t` is an HMAC of the domain under SESSION_SECRET,
   so a link issued for one store cannot be edited into a link for another, and
   nothing outside this process can produce one. See lib/session.ts.

   AN EXISTING STORE IS NOT TOUCHED. A merchant may open their invite twice, or
   have been added to the sheet since; overwriting their name, their email or
   their raised page limit with whatever the link happened to carry would make
   the second click destructive. Existing means sign in and nothing else.
   ========================================================================== */

export const dynamic = "force-dynamic";

/** What a brand-new store gets. Deliberately small: an invite is a trial, and
    an operator raises it in admin once the merchant is real. */
const INVITE_PAGE_LIMIT = 3;

const bodySchema = z.object({
  domain: z.string().min(3).max(255),
  token: z.string().min(8).max(600),
  name: z.string().max(255).default(""),
  email: z.string().max(255).default(""),
});

export type ProvisionResponse =
  | { ok: true; domain: string; created: boolean }
  | { ok: false; error: string };

export async function POST(request: Request) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      { ok: false, error: "This invite link is incomplete." } satisfies ProvisionResponse,
      { status: 400 },
    );
  }

  const domain = normalizeDomain(parsed.domain);
  if (!domain.includes("."))
    return Response.json(
      { ok: false, error: "That does not look like a store domain." } satisfies ProvisionResponse,
      { status: 400 },
    );

  /* Before anything is read or written. An unsigned request is not a request
     for a store that does not exist — it is somebody typing a URL. */
  let signed: boolean;
  try {
    signed = verifyInvite(parsed.token, domain);
  } catch (err) {
    /* No SESSION_SECRET configured. Permanent, and it must not read as "your
       link is bad" — the link is fine and the deployment is not finished. */
    if (err instanceof MissingSecretError)
      return Response.json(
        { ok: false, error: "This deployment is not finished being set up." } satisfies ProvisionResponse,
        { status: 503 },
      );
    throw err;
  }

  if (!signed)
    return Response.json(
      {
        ok: false,
        error: "This invite link is not valid, or it has expired.",
      } satisfies ProvisionResponse,
      { status: 403 },
    );

  const repo = getRepo();

  /* `findAllowedStore` rather than `getStore`: a domain in the compiled-in list
     is already a store even with no row of its own, and creating a second
     record for it here would be inventing a duplicate. It also honours the
     blocked tombstone, so an invite cannot re-admit a store access was taken
     away from. */
  let store = await findAllowedStore(domain).catch(() => null);
  const created = store === null;

  if (created) {
    const blocked = await repo.getStore(domain).catch(() => null);
    if (blocked?.blocked)
      return Response.json(
        { ok: false, error: "This store no longer has access." } satisfies ProvisionResponse,
        { status: 403 },
      );

    const name = parsed.name.trim();
    const email = parsed.email.trim();

    await repo.upsertStores([
      {
        domain,
        email: email || null,
        storeName: name || null,
        shopifyPlan: null,
        currentPlan: null,
        daysUsed: null,
        country: null,
        /* Says where the row came from. An operator looking at the Users table
           should be able to tell an invited store from one that came off the
           sheet without reading the database. */
        userType: "Invite",
        status: "Đang sử dụng",
        pageLimit: INVITE_PAGE_LIMIT,
        firstSeenAt: null,
        lastSeenAt: null,
        blocked: false,
      },
    ]);
    store = await repo.getStore(domain);
  }

  try {
    await setStoreSession(domain);
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: "Could not start a session.",
        hint: (err as Error).message,
      } as ProvisionResponse,
      { status: 500 },
    );
  }

  /* Best effort, exactly as the sign-in route treats it: bookkeeping must not
     turn a successful sign-in into a failure. */
  await repo.markSignedIn(domain, new Date()).catch(() => {});

  return Response.json({ ok: true, domain, created } satisfies ProvisionResponse);
}
