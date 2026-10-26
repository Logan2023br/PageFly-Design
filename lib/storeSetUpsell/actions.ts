import "server-only";

import { UpsellError } from "@/lib/upsell/types";
import { db, logEvent, tx } from "./db";
import { check, trackOne } from "./job";
import { approve, draft, loadSetNames, reject, sendOne, type SendOutcome } from "./messages";
import { getSsuSettings } from "./settings";
import { SSU_MESSAGE_KINDS, type SsuCustomer, type SsuMessageKind } from "./types";

/* What an admin does on the screen, one function per button. */

async function customer(domain: string): Promise<SsuCustomer> {
  const p = await db();
  const { rows } = await p.query<SsuCustomer>("select * from ssu_customers where store_domain = $1", [domain]);
  if (!rows[0]) throw new UpsellError("Không có store này.", 404);
  return rows[0];
}

/** Approve and send at once: the customer gets it this minute, not the next. */
export async function approveAndSend(id: string, content: string | null, actor: string): Promise<SendOutcome> {
  await approve(id, content, actor);
  const r = await sendOne(id, actor);
  if (r === "blocked_review") throw new UpsellError("Không gửi: khách đã review 5★ trên Crisp — tin đã được bỏ.", 409);
  if (r === "failed" || r === "skipped") {
    const p = await db();
    const { rows } = await p.query<{ error: string | null }>("select error from ssu_messages where id = $1", [id]);
    if (r === "skipped") throw new UpsellError(`Không gửi: ${rows[0]?.error ?? "tin không còn chờ gửi"}.`, 409);
    throw new UpsellError(`Gửi lỗi: ${rows[0]?.error ?? "không rõ"}`, 502);
  }
  return r;
}

export async function messageAction(id: string, action: string, content: string | null, actor: string): Promise<void> {
  if (action === "approve") await approveAndSend(id, content, actor);
  else if (action === "approve_later") await approve(id, content, actor);
  else if (action === "reject") await reject(id, actor);
  else throw new UpsellError("Unknown action.");
}

export async function bulkMessages(ids: string[], action: string, actor: string): Promise<{ done: number; errors: string[] }> {
  const errors: string[] = [];
  let done = 0;
  for (const id of ids.slice(0, 200)) {
    try {
      /* Bulk approval queues them; the minute job sends them in turn, so a
         page of fifty does not hold the request open for Crisp fifty times. */
      if (action === "approve") await approve(id, null, actor);
      else if (action === "reject") await reject(id, actor);
      else throw new UpsellError("Unknown action.");
      done++;
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { done, errors };
}

export async function customerAction(domain: string, action: string, body: Record<string, unknown>, actor: string): Promise<unknown> {
  const cu = await customer(domain);
  const p = await db();
  switch (action) {
    case "mark_checked":
      await tx(async (c) => {
        await c.query("update ssu_customers set needs_check = false, checked_by = $2, checked_at = now(), updated_at = now() where store_domain = $1", [domain, actor]);
        await logEvent(c, domain, "admin_checked", actor, {});
      });
      return null;
    case "needs_check":
      await p.query("update ssu_customers set needs_check = true, updated_at = now() where store_domain = $1", [domain]);
      return null;
    case "skip":
      await tx(async (c) => {
        await c.query(
          "update ssu_messages set status = 'rejected' where store_domain = $1 and status in ('pending_review', 'approved', 'failed')",
          [domain],
        );
        await c.query(
          "update ssu_customers set status = case when sent_at is null then 'skipped' else status end, skip_reason = 'Admin bỏ qua', updated_at = now() where store_domain = $1",
          [domain],
        );
        await logEvent(c, domain, "admin_skipped", actor, {});
      });
      return null;
    case "recheck": {
      /* Look again: AC2, Crisp, and the decision — a skipped store whose
         review was removed, or whose email AC2 now knows. Never after a send. */
      if (cu.sent_at) {
        await trackOne({ ...cu, crisp_checked_at: null, ac2_synced_at: null }, actor);
        return null;
      }
      await p.query("update ssu_customers set status = 'new', skip_reason = null where store_domain = $1", [domain]);
      return check(domain, await getSsuSettings(), actor);
    }
    case "draft_thanks":
    case "draft_review":
    case "draft_custom":
    case "draft_kind": {
      const named: Record<string, SsuMessageKind> = { draft_thanks: "thanks", draft_review: "review_ask", draft_custom: "custom" };
      const kind = action === "draft_kind" ? (String(body.kind) as SsuMessageKind) : named[action];
      if (!(SSU_MESSAGE_KINDS as readonly string[]).includes(kind)) throw new UpsellError("Không có loại tin này.");
      if (kind !== "thanks" && kind !== "custom" && !cu.sent_at) throw new UpsellError("Chưa gửi tin cảm ơn — tin này đi sau nó.", 409);
      if (cu.app_review !== null && Number(cu.app_review) >= 5 && kind !== "custom")
        throw new UpsellError("Khách đã review 5★ — không soạn tin này.", 409);
      if (!cu.email) throw new UpsellError("Store này không có email.", 409);
      const content = typeof body.content === "string" && body.content.trim() ? body.content : undefined;
      if (kind === "custom" && !content) throw new UpsellError("Viết nội dung tin trước.", 400);
      /* Settings read before the transaction: no second connection inside it. */
      const cfg = await getSsuSettings();
      await loadSetNames();
      const id = await tx((c) => draft(c, cu, kind, { auto: false, actor, content, cfg }));
      if (!id) throw new UpsellError("Store này đã có tin loại này rồi.", 409);
      return { id };
    }
    case "note":
      await p.query("update ssu_customers set notes = $2, updated_at = now() where store_domain = $1", [domain, String(body.notes ?? "").slice(0, 4000)]);
      return null;
    default:
      throw new UpsellError("Unknown action.");
  }
}
