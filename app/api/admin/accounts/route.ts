import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ALL_ADMIN_SECTIONS, type AdminSection } from "@/lib/adminSections";
import { getRepo } from "@/lib/db";
import { AdminUsernameTakenError } from "@/lib/db/types";
import { hashAdminPassword, readAdminSection } from "@/lib/session";

/* ==========================================================================
   /api/admin/accounts — the sign-ins to admin, for the Accounts screen.

   GET                                    every account, without its password
   POST    { username, password, sections }   a new account
   PATCH   { id, sections, password? }        new sections, and a new password
                                              when one is given
   DELETE  ?id=<id>                           the account; its sign-in stops at
                                              its next request

   Only a sign-in with the "accounts" section may call it. The owner — the
   ADMIN_USERNAME sign-in — is not stored here, cannot be edited, and its
   username cannot be taken by an account.
   ========================================================================== */

export const dynamic = "force-dynamic";

export type AdminAccountView = {
  id: string;
  username: string;
  sections: AdminSection[];
  createdAt: string;
  updatedAt: string;
};

export type AccountsResponse =
  | { ok: true; owner: string; accounts: AdminAccountView[] }
  | { ok: false; error: string };

const fail = (error: string, status = 400) =>
  Response.json({ ok: false, error } satisfies AccountsResponse, { status });

async function guard(): Promise<Response | null> {
  if (await readAdminSection("accounts")) return null;
  return fail("Not signed in, or no access to Accounts.", 401);
}

const ownerName = () => process.env.ADMIN_USERNAME ?? "admin";

const sections = z.array(z.enum(ALL_ADMIN_SECTIONS as [AdminSection, ...AdminSection[]])).max(20);
const password = z
  .string()
  .min(8, "The password needs at least 8 characters.")
  .max(200, "The password is too long.");
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, "The username takes 3–40 of a–z, 0–9, dot, dash, underscore.");

const createSchema = z.object({ username, password, sections });
const updateSchema = z.object({
  id: z.string().min(1),
  sections,
  password: password.optional().or(z.literal("").transform(() => undefined)),
});

async function listing(): Promise<Response> {
  const accounts = (await getRepo().listAdminAccounts()).map(
    (a): AdminAccountView => ({
      id: a.id,
      username: a.username,
      sections: a.sections,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }),
  );
  return Response.json({ ok: true, owner: ownerName(), accounts } satisfies AccountsResponse);
}

const firstIssue = (err: z.ZodError) => err.issues[0]?.message ?? "Invalid input.";

export async function GET() {
  return (await guard()) ?? listing();
}

export async function POST(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { username: name, password: pw, sections: given } = parsed.data;
  if (name === ownerName().toLowerCase()) return fail(`The username "${name}" is already used.`, 409);
  try {
    await getRepo().saveAdminAccount({
      id: randomBytes(8).toString("hex"),
      username: name,
      passwordHash: hashAdminPassword(pw),
      sections: [...new Set(given)],
    });
  } catch (err) {
    if (err instanceof AdminUsernameTakenError) return fail(err.message, 409);
    throw err;
  }
  return listing();
}

export async function PATCH(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const repo = getRepo();
  const account = await repo.getAdminAccount(parsed.data.id);
  if (!account) return fail("That account no longer exists.", 404);
  await repo.saveAdminAccount({
    id: account.id,
    username: account.username,
    passwordHash: parsed.data.password
      ? hashAdminPassword(parsed.data.password)
      : account.passwordHash,
    sections: [...new Set(parsed.data.sections)],
  });
  return listing();
}

export async function DELETE(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return fail("Which account?");
  await getRepo().deleteAdminAccount(id);
  return listing();
}
