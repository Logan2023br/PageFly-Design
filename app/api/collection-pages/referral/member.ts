import "server-only";

import { getRepo } from "@/lib/db";
import type { ReferralMemberRecord } from "@/lib/db/types";
import { readReferralSession } from "@/lib/session";

/** The signed-in member, or a 401 to hand straight back. */
export async function currentMember(): Promise<
  { member: ReferralMemberRecord; denied: null } | { member: null; denied: Response }
> {
  const id = await readReferralSession();
  const member = id ? await getRepo().getReferralMember(id) : null;
  if (!member) {
    return {
      member: null,
      denied: Response.json({ ok: false, error: "Please sign in again." }, { status: 401 }),
    };
  }
  return { member, denied: null };
}
