import "server-only";

import { z } from "zod";
import { newId } from "./collectionPagesServer";
import { getRepo } from "./db";
import { ReferralTakenError, type ReferralMemberRecord, type ReferralRecord } from "./db/types";
import { normalizeDomain } from "./storeForm";

/* ==========================================================================
   The referral program, server side: who is signed in, and the rules a
   referral has to pass before it is stored. The member routes and the admin
   routes both come through `saveReferralFor`, so a store the member cannot add
   is a store the admin cannot add by accident either — except that an admin
   may set the status, which is the one thing a member never can.
   ========================================================================== */

export const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** A store domain as typed, cleaned, or null when it cannot be one. */
export function cleanDomain(raw: string): string | null {
  const d = normalizeDomain(raw);
  return DOMAIN_RE.test(d) ? d : null;
}

export const referralInput = z.object({
  domain: z.string().trim().min(1, "Enter the store's domain.").max(200),
  plan: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  note: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});

export type SaveResult = { ok: true; referral: ReferralRecord } | { ok: false; error: string };

/**
 * Add or change one referral for a member.
 *
 * THE RULES, and why each one exists:
 *   - a real-looking store domain           a typo is a row nobody can check
 *   - not the member's own store            refer others, not yourself
 *   - not a store already referred          one store, one referrer, one reward
 *   - a verified row is locked for members  it has been checked; changing the
 *                                           domain would move the check to a
 *                                           store nobody looked at
 */
export async function saveReferralFor(
  member: ReferralMemberRecord,
  input: { id?: string; domain: string; plan: string | null; note: string | null },
  opts: { admin?: boolean; status?: ReferralRecord["status"]; adminNote?: string | null } = {},
): Promise<SaveResult> {
  const repo = getRepo();
  const domain = cleanDomain(input.domain);
  if (!domain) return { ok: false, error: "Enter the store's domain, like their-store.myshopify.com." };
  if (domain === member.domain) return { ok: false, error: "That is your own store — refer other stores." };

  const existing = input.id ? (await repo.listReferrals(member.id)).find((r) => r.id === input.id) : null;
  if (input.id && !existing) return { ok: false, error: "That store is no longer on your list." };
  if (existing?.status === "verified" && !opts.admin) {
    return { ok: false, error: "This store has been verified and can no longer be changed." };
  }

  const taken = await repo.getReferralByDomain(domain);
  if (taken && taken.id !== existing?.id) {
    return {
      ok: false,
      error:
        taken.memberId === member.id
          ? "That store is already on your list."
          : "That store has already been referred by another member.",
    };
  }

  const now = new Date().toISOString();
  const referral: ReferralRecord = {
    id: existing?.id ?? newId(),
    memberId: member.id,
    domain,
    plan: input.plan,
    note: input.note,
    /* A member's edit sends a rejected store back to be checked again — they
       have presumably fixed what was wrong. An admin sets it outright. */
    status: opts.status ?? (existing?.status === "verified" ? "verified" : "pending"),
    adminNote: opts.adminNote !== undefined ? opts.adminNote : (existing?.adminNote ?? null),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  try {
    await repo.saveReferral(referral);
  } catch (err) {
    if (err instanceof ReferralTakenError) {
      return { ok: false, error: "That store has already been referred by another member." };
    }
    throw err;
  }
  return { ok: true, referral };
}

/** A member's view of themselves: no admin note, no internal fields. */
export function publicMember(m: ReferralMemberRecord) {
  return {
    domain: m.domain,
    email: m.email,
    name: m.name,
    status: m.status,
    rewardStatus: m.rewardStatus,
    createdAt: m.createdAt,
  };
}

export function publicReferral(r: ReferralRecord) {
  return {
    id: r.id,
    domain: r.domain,
    plan: r.plan,
    note: r.note,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export type PublicMember = ReturnType<typeof publicMember>;
export type PublicReferral = ReturnType<typeof publicReferral>;
