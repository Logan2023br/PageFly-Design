import { z } from "zod";
import { getRepo } from "@/lib/db";
import { publicMember, publicReferral, referralInput, saveReferralFor } from "@/lib/referralServer";
import { currentMember } from "../member";
import { rateLimited } from "@/lib/rateLimit";

const MAX_PENDING = 25;

/* ==========================================================================
   The signed-in member's referred stores.

   POST    { domain, plan?, note? }       add one
   PATCH   { id, domain, plan?, note? }   change one that is not verified yet
   DELETE  ?id=                           remove one that is not verified yet

   Every answer is the member's whole list again, so the page redraws from
   what was stored. The rules are in `saveReferralFor`.
   ========================================================================== */

export const dynamic = "force-dynamic";

async function answer(memberId: string) {
  const repo = getRepo();
  const [member, referrals] = await Promise.all([
    repo.getReferralMember(memberId),
    repo.listReferrals(memberId),
  ]);
  return Response.json({
    ok: true,
    member: publicMember(member!),
    referrals: referrals.map(publicReferral),
  });
}

const refuse = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

export async function POST(request: Request) {
  const { member, denied } = await currentMember();
  if (denied) return denied;
  if (member.status === "paused") return refuse("Your membership is paused — contact us to resume it.", 403);
  const parsed = referralInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return refuse(parsed.error.issues[0]?.message ?? "Check the form.");
  /* One referrer per store, first come first served — so a member may not
     sit on more unchecked stores than a real referrer has, nor add them in
     a loop to block everyone else's. */
  const pending = (await getRepo().listReferrals(member.id)).filter((r) => r.status !== "verified").length;
  if (pending >= MAX_PENDING) return refuse(`You have ${MAX_PENDING} stores waiting for review — wait for those before adding more.`, 429);
  if (rateLimited(`referral-add:${member.id}`, 30, 60 * 60 * 1000)) return refuse("Too many stores added this hour — try again later.", 429);
  const saved = await saveReferralFor(member, parsed.data);
  return saved.ok ? answer(member.id) : refuse(saved.error, 409);
}

export async function PATCH(request: Request) {
  const { member, denied } = await currentMember();
  if (denied) return denied;
  if (member.status === "paused") return refuse("Your membership is paused — contact us to resume it.", 403);
  const parsed = referralInput
    .extend({ id: z.string().max(64) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return refuse(parsed.error.issues[0]?.message ?? "Check the form.");
  const saved = await saveReferralFor(member, parsed.data);
  return saved.ok ? answer(member.id) : refuse(saved.error, 409);
}

export async function DELETE(request: Request) {
  const { member, denied } = await currentMember();
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  const repo = getRepo();
  const mine = (await repo.listReferrals(member.id)).find((r) => r.id === id);
  if (!mine) return refuse("That store is no longer on your list.", 404);
  if (mine.status === "verified") return refuse("A verified store stays on your list.", 403);
  await repo.deleteReferral(mine.id);
  return answer(member.id);
}
