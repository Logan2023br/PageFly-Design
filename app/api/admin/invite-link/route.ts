import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizeDomain } from "@/lib/sheet";
import { INVITE_MAX_AGE, readAdminSession, signInvite } from "@/lib/session";

/* ==========================================================================
   POST /api/admin/invite-link   mint one signed invite link

   So that n8n can send an invite without holding SESSION_SECRET. It asks for a
   link, the signing happens here, and the secret never leaves this process —
   the only credential the automation needs is the SYNC_SECRET header it
   already uses for /api/admin/pending-reviews.

   Authenticated the same way as that route and as /api/admin/sync: the header,
   or an admin session for anyone trying it from a signed-in tab.

   The link is built from the request's own origin, so a call to production
   mints production links and a call to localhost mints local ones. Nothing to
   configure, and no way for a deploy to start handing out links to a host it
   is not on.
   ========================================================================== */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  domain: z.string().min(3).max(255),
  name: z.string().max(255).default(""),
  email: z.string().max(255).default(""),
});

export type InviteLinkResponse =
  | { ok: true; url: string; domain: string; expiresInDays: number }
  | { ok: false; error: string };

function secretMatches(header: string | null): boolean {
  const expected = process.env.SYNC_SECRET;
  if (!expected || !header) return false;
  // Hashed first so the compare is constant time regardless of length.
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(header), digest(expected));
}

export async function POST(request: Request) {
  const authorised =
    secretMatches(request.headers.get("x-sync-secret")) ||
    (await readAdminSession().catch(() => null));

  if (!authorised)
    return Response.json(
      { ok: false, error: "Not authorised." } satisfies InviteLinkResponse,
      { status: 401 },
    );

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      { ok: false, error: "A domain is required." } satisfies InviteLinkResponse,
      { status: 400 },
    );
  }

  const domain = normalizeDomain(body.domain);
  if (!domain.includes("."))
    return Response.json(
      { ok: false, error: "That does not look like a store domain." } satisfies InviteLinkResponse,
      { status: 400 },
    );

  const origin = process.env.PFD_PUBLIC_URL?.trim().replace(/\/+$/, "")
    ?? new URL(request.url).origin;

  /* Every value encoded, because a store name with a space or an ampersand in
     it would otherwise cut the query string in half — and the half that went
     missing would be the signature. */
  const query = new URLSearchParams({ login: domain });
  if (body.name.trim()) query.set("name", body.name.trim());
  if (body.email.trim()) query.set("email", body.email.trim());
  query.set("t", signInvite(domain));

  return Response.json({
    ok: true,
    url: `${origin}/?${query.toString()}`,
    domain,
    expiresInDays: Math.round(INVITE_MAX_AGE / 86400),
  } satisfies InviteLinkResponse);
}
