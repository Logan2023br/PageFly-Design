import { z } from "zod";
import {
  MissingSecretError,
  checkAdminCredentials,
  clearAdminSession,
  setAdminSession,
} from "@/lib/session";

/* ==========================================================================
   POST /api/auth/admin   sign in
   DELETE                 sign out

   Credentials are compared on the server only, so neither the username nor the
   password is ever part of the browser bundle. They default to the pair
   specified for launch and are overridable with ADMIN_USERNAME /
   ADMIN_PASSWORD — which is what should happen before this is reachable by
   anyone outside the team.
   ========================================================================== */

const bodySchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
});

export type AdminAuthResponse = { ok: true } | { ok: false; error: string };

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

  if (!checkAdminCredentials(body.username, body.password)) {
    /* One message for a wrong username and a wrong password alike — saying which
       was wrong confirms that a username exists. */
    return Response.json(
      { ok: false, error: "Incorrect username or password." } satisfies AdminAuthResponse,
      { status: 401 },
    );
  }

  try {
    await setAdminSession();
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
