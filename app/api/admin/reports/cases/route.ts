import { readAdminSection } from "@/lib/session";
import { UPGRADE_KINDS } from "@/lib/upsell/adminQueries";
import { db as upsellDb, hasUpsellDatabase } from "@/lib/upsell/db";
import { fail, json } from "@/lib/upsell/api";
import { db as urspDb, hasUrspDatabase } from "@/lib/ursp/db";

/* ==========================================================================
   GET /api/admin/reports/cases?from=2026-11-09&to=2026-11-13

   The weekly report's case table, for Upsell Build 2 pages (bpu) and Upsell
   Responsive (ursp), over the customers first messaged from `from` to `to`
   (both days included, Vietnam time) — and where each of them stands now.

     sent / read / replied     messaged, read it, replied
     working / done / closed   ursp only: Đang xử lý · Đã xử lý (not closed) · Kết thúc
     free_paid / paid_paid     upgrades that count, split by the price before:
                               bpu  — only "organic" and "claim" upgrades (never "normal")
                               ursp — only after we handled the case (done) and closed it
     total                     free_paid + paid_paid

   Read-only. Admin with both sections.
   ========================================================================== */

export const dynamic = "force-dynamic";
const VN = "Asia/Ho_Chi_Minh";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const inRange = (col: string) => `(${col} at time zone '${VN}')::date between $1::date and $2::date`;

type Counts = Record<string, number | null>;
const nums = (r: Record<string, unknown> | undefined): Counts =>
  Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, v === null ? null : Number(v)]));

export async function GET(req: Request) {
  if (!(await readAdminSection("upsell")) || !(await readAdminSection("ursp"))) return json({ ok: false, error: "Not signed in." }, 401);
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!DAY.test(from) || !DAY.test(to) || from > to) return json({ ok: false, error: "from and to are yyyy-mm-dd, from ≤ to." }, 400);
  try {
    const out: { from: string; to: string; bpu: Counts | null; ursp: Counts | null } = { from, to, bpu: null, ursp: null };

    if (hasUpsellDatabase()) {
      const sent = `l."group" = 'test' and l.sent_at is not null and ${inRange("l.sent_at")}`;
      const counted = `l.upgraded is true and ((${UPGRADE_KINDS.organic.sql}) or (${UPGRADE_KINDS.claim.sql}))`;
      const wasFree = `coalesce(l.price_at_send, 0) = 0`;
      const { rows } = await (await upsellDb()).query(
        `select count(*) filter (where ${sent}) as sent,
                count(*) filter (where ${sent} and l.message_read is true) as read,
                count(*) filter (where ${sent} and l.replied is true) as replied,
                count(*) filter (where ${sent} and ${counted} and ${wasFree}) as free_paid,
                count(*) filter (where ${sent} and ${counted} and not ${wasFree}) as paid_paid
           from upsell_leads l`,
        [from, to],
      );
      const r = nums(rows[0]);
      out.bpu = { ...r, working: null, done: null, closed: null, total: (r.free_paid ?? 0) + (r.paid_paid ?? 0) };
    }

    if (hasUrspDatabase()) {
      const sent = `t.status = 'sent' and t.sent_at is not null and ${inRange("t.sent_at")}`;
      const counted = `t.upgraded_at is not null and t.done_at is not null and t.closed_at is not null and t.upgraded_at >= t.done_at`;
      const wasFree = `coalesce(t.first_price, t.pf_price, 0) = 0`;
      const { rows } = await (await urspDb()).query(
        `select count(*) filter (where ${sent}) as sent,
                count(*) filter (where ${sent} and t.read_at is not null) as read,
                count(*) filter (where ${sent} and t.replied_at is not null) as replied,
                count(*) filter (where ${sent} and t.working_at is not null and t.done_at is null and t.dismissed_at is null) as working,
                count(*) filter (where ${sent} and t.done_at is not null and t.closed_at is null) as done,
                count(*) filter (where ${sent} and t.closed_at is not null) as closed,
                count(*) filter (where ${sent} and ${counted} and ${wasFree}) as free_paid,
                count(*) filter (where ${sent} and ${counted} and not ${wasFree}) as paid_paid
           from ursp_targets t`,
        [from, to],
      );
      const r = nums(rows[0]);
      out.ursp = { ...r, total: (r.free_paid ?? 0) + (r.paid_paid ?? 0) };
    }

    return json({ ok: true, ...out });
  } catch (err) {
    return fail(err);
  }
}
