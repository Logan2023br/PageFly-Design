import { z } from "zod";
import { getRepo } from "@/lib/db";
import { referralInput, saveReferralFor } from "@/lib/referralServer";
import { fail, firstIssue, guard } from "../../shared";
import { listing } from "../list";

/* ==========================================================================
   One member's referred stores, as the team handles them.

   POST    { memberId, domain, plan?, note?, status, adminNote? }   add on their behalf
   PATCH   { id, memberId, domain, plan?, note?, status, adminNote? } verify, reject, correct
   DELETE  ?id=

   The member's own rules still apply (their own store, one referrer per
   store) — the admin additionally sets the status and may change a verified
   row, which is the whole of what "admin" adds here.
   ========================================================================== */

export const dynamic = "force-dynamic";

const schema = referralInput.extend({
  id: z.string().max(64).optional(),
  memberId: z.string().max(64),
  status: z.enum(["pending", "verified", "rejected"]),
  adminNote: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});

async function save(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const member = await getRepo().getReferralMember(parsed.data.memberId);
  if (!member) return fail("That member no longer exists.", 404);
  const saved = await saveReferralFor(member, parsed.data, {
    admin: true,
    status: parsed.data.status,
    adminNote: parsed.data.adminNote,
  });
  return saved.ok ? listing() : fail(saved.error, 409);
}

export const POST = save;
export const PATCH = save;

export async function DELETE(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return fail("Which store?");
  await getRepo().deleteReferral(id);
  return listing();
}
