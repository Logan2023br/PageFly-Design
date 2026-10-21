import "server-only";

import { upsellOrigin } from "./common";
import { db } from "./db";
import { getInternal, getSettings, setInternal } from "./settings";

/* ==========================================================================
   Slack: "there is something to review" — or a message the script could not
   send, which waits on the Lỗi gửi tab for someone to retry or drop it.

   AT MOST ONE MESSAGE PER 15 MINUTES. A Builder run lands two leads a minute
   apart, and the script drafts follow-ups in batches; a ping per item would
   be muted within a day. So a notification either goes now (the window is
   open) or marks itself pending, and the maintenance tick flushes pending
   ones once the window opens. Each message says what is waiting NOW, read
   fresh, not what triggered it.
   ========================================================================== */

const WINDOW_MS = 15 * 60 * 1000;

type Kind = "lead" | "message" | "failed";

export async function notifySlack(kind: Kind): Promise<void> {
  const cfg = await getSettings();
  if (!cfg.slack_webhook_url) return;
  const pending = new Set(((await getInternal("slack_pending")) as Kind[] | null) ?? []);
  pending.add(kind);
  await setInternal("slack_pending", [...pending]);
  await flushSlack();
}

/** Send if something is pending and the window allows. Safe to call often. */
export async function flushSlack(): Promise<boolean> {
  const cfg = await getSettings();
  if (!cfg.slack_webhook_url) return false;
  const pending = ((await getInternal("slack_pending")) as Kind[] | null) ?? [];
  if (pending.length === 0) return false;
  const last = Number((await getInternal("slack_last_at")) ?? 0);
  if (Date.now() - last < WINDOW_MS) return false;

  const p = await db();
  const { rows } = await p.query<{ pages: number; messages: number; failed: number }>(
    `select (select count(*) from upsell_leads where status = 'pending_review') as pages,
            (select count(*) from upsell_messages where status = 'pending_review') as messages,
            (select count(*) from upsell_messages where status = 'failed') as failed`,
  );
  const { pages, messages, failed } = rows[0];
  /* Claim the window before sending, so two instances flushing at once send
     once. A failed send then waits for the next window, which is fine. */
  await setInternal("slack_last_at", Date.now());
  await setInternal("slack_pending", []);
  if (pages === 0 && messages === 0 && failed === 0) return false;

  const base = `${upsellOrigin()}/design/admin/upsell`;
  const lines = [
    pages > 0 ? `• <${base}?tab=pages|${pages} lead chờ duyệt page>` : null,
    messages > 0 ? `• <${base}?tab=messages|${messages} tin chờ duyệt>` : null,
    failed > 0 ? `• <${base}?tab=failed|${failed} tin gửi lỗi>` : null,
  ].filter(Boolean);
  const head = pages === 0 && messages === 0 ? "có tin gửi lỗi" : failed > 0 ? "có việc cần xử lý" : "có việc cần duyệt";
  try {
    const res = await fetch(cfg.slack_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `*Upsell Build Pages* — ${head}\n${lines.join("\n")}` }),
      signal: AbortSignal.timeout(10_000),
      /* Slack answers directly; a redirect would be somewhere else. */
      redirect: "error",
    });
    return res.ok;
  } catch (err) {
    console.error("[upsell] slack", err);
    return false;
  }
}
