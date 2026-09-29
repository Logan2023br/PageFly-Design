import type { ReferralRecord } from "./db/types";

/* ==========================================================================
   THE REFERRAL PROGRAM'S RULES, IN ONE PLACE.

   Browser-safe, so the member's page, the admin screen and the routes all
   read the same goal and count progress the same way.
   ========================================================================== */

/** Verified referrals needed for the reward. */
export const REFERRAL_GOAL = 5;

export const REFERRAL_URL = "/collection-pages/referral";

export type ReferralProgress = {
  total: number;
  pending: number;
  verified: number;
  rejected: number;
  /** the goal is met — whether or not the reward has been handed over */
  earned: boolean;
};

export function progressOf(referrals: Pick<ReferralRecord, "status">[]): ReferralProgress {
  const count = (s: string) => referrals.filter((r) => r.status === s).length;
  const verified = count("verified");
  return {
    total: referrals.length,
    pending: count("pending"),
    verified,
    rejected: count("rejected"),
    earned: verified >= REFERRAL_GOAL,
  };
}

/** What a member sees for a referral's status. */
export const STATUS_LABEL: Record<ReferralRecord["status"], string> = {
  pending: "Checking",
  verified: "Verified",
  rejected: "Not eligible",
};
