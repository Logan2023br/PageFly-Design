import { z } from "zod";
import { clientIp, signInLimits } from "@/lib/rateLimit";
import { getRepo } from "@/lib/db";
import {
  DECOY_ADMIN_HASH,
  accountFingerprint,
  ownerFingerprint,
  MissingSecretError,
  checkAdminCredentials,
  clearAdminSession,
  setAdminSession,
  verifyAdminPassword,
} from "@/lib/session";

/* ==========================================================================
   POST /api/auth/admin   sign in
   DELETE                 sign out

   Credentials are compared on the server only, so neither the username nor the
   password is ever part of the browser bundle. They default to the pair
   specified for launch and are overridable with ADMIN_USERNAME /
   ADMIN_PASSWORD — which is what should happen before this is reachable by
   anyone outside the team. That pair is the owner; any other sign-in is an
   account made on admin's Accounts screen, with the sections it was given.
   ========================================================================== */

const bodySchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
});

export type AdminAuthResponse = { ok: true } | { ok: false; error: string };

/* BRUTE FORCE. Failures are counted per address (10) and per username (30),
   so neither rotating usernames from one address nor spreading one
   username's guesses over many addresses gets far. The username limit is
   the higher one because anyone can spend it: set at 10, ten wrong guesses
   from anywhere would lock the real owner out. Past a limit nothing is
   checked — not even a right password — until the window passes. */
const FAILS = 10;
const USER_FAILS = 30;
const WINDOW = 15 * 60 * 1000;

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      { ok: false, error: "Enter a username and password." } satisfies AdminAuthResponse,
      { status: 400 },
    );
  }

  const byIp = `admin-login:ip:${clientIp(request)}`;
  const byUser = `admin-login:user:${body.username.trim().toLowerCase()}`;
  if (signInLimits.isLimited(byIp, FAILS, WINDOW) || signInLimits.isLimited(byUser, USER_FAILS, WINDOW))
    return Response.json(
      { ok: false, error: "Too many attempts. Try again in 15 minutes." } satisfies AdminAuthResponse,
      { status: 429 },
    );

  let accountId: string | undefined;
  let pv = ownerFingerprint();
  if (!checkAdminCredentials(body.username, body.password)) {
    const account = await getRepo()
      .getAdminAccountByUsername(body.username)
      .catch(() => null);
    const ok = verifyAdminPassword(body.password, account?.passwordHash ?? DECOY_ADMIN_HASH);
    if (!account || !ok) {
      signInLimits.hit(byIp, FAILS, WINDOW);
      signInLimits.hit(byUser, USER_FAILS, WINDOW);
      /* One message for a wrong username and a wrong password alike — saying
         which was wrong confirms that a username exists. */
      return Response.json(
        { ok: false, error: "Incorrect username or password." } satisfies AdminAuthResponse,
        { status: 401 },
      );
    }
    accountId = account.id;
    pv = accountFingerprint(account.passwordHash);
  }

  signInLimits.clear(byUser);
  try {
    await setAdminSession(body.username, accountId, pv);
  } catch (err) {
    if (err instanceof MissingSecretError)
      return Response.json(
        { ok: false, error: err.message } satisfies AdminAuthResponse,
        { status: 500 },
      );
    throw err;
  }

  return Response.json({ ok: true } satisfies AdminAuthResponse);
}

export async function DELETE() {
  await clearAdminSession();
  return Response.json({ ok: true });
}
