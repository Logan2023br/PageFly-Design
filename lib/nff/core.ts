import "server-only";

import {
  conversationMessages,
  crispSender,
  resolveConversation,
  reviewCheck,
  sendInConversation,
  sendNote,
  ticketLink,
} from "@/lib/storeSetUpsell/clients";
import { connection } from "@/lib/storeSetUpsell/settings";
import { UpsellError } from "@/lib/upsell/types";
import { readReply } from "./ai";
import { db, getState, hasNffDatabase, logEvent, setState } from "./db";
import { DEFAULT_TEMPLATE, getNffSettings, type NffSettings } from "./settings";
import type { NffTarget } from "./types";

/* ==========================================================================
   Feedback New Feature: the stores whose Upsell Responsive case was handled
   (Đã xử lý / Kết thúc) get a message introducing PageFly's new features —
   Funnel Builder, Bundles, Post-purchase offer, each title its own link into
   their store's PageFly admin — and are asked which one they need.

     collect  every 10 minutes: each handled case not here yet becomes a
              message on Chờ duyệt (one per store, ever)
     send     every 5 minutes: what was approved goes into the store's latest
              Crisp conversation, once it has been quiet for quiet_minutes;
              then a note (FL: go on supporting and guiding them) and resolved
     track    every hour per store: read? replied? Haiku keeps only their
              words about the features and which one they want; a note tells
              FL to go on supporting them, and the admin's bell rings
   ========================================================================== */

const TICK_MS = 5 * 60_000;
const COLLECT_EVERY_MS = 10 * 60_000;
const TRACK_EVERY_MS = 60 * 60_000;

/* ---------------------------------------------------------------- message */

/** "mandotos" from "mandotos.myshopify.com": the store handle in admin.shopify.com links. */
export const storeHandle = (domain: string) => domain.trim().toLowerCase().replace(/\.myshopify\.com$/, "");

export function composeMessage(t: Pick<NffTarget, "store_name" | "store_domain">, cfg: NffSettings): string {
  const tpl = cfg.template.trim() || DEFAULT_TEMPLATE;
  return tpl
    .replaceAll("{name}", t.store_name?.trim() || storeHandle(t.store_domain))
    .replaceAll("{store_name}", t.store_name?.trim() || storeHandle(t.store_domain))
    .replaceAll("{store}", storeHandle(t.store_domain))
    .replaceAll("{pic}", cfg.sender_name);
}

/* ---------------------------------------------------------------- collect */

export async function collect(): Promise<number> {
  const cfg = await getNffSettings();
  const p = await db();
  /* the handled cases of Upsell Responsive (same database); a store is taken once */
  const { rows } = await p.query<{
    id: string;
    store_domain: string;
    store_name: string | null;
    email: string | null;
    session_id: string | null;
    ticket_link: string | null;
    stage: string;
  }>(
    `select u.id, u.store_domain, u.store_name, u.email, u.session_id, u.ticket_link,
            case when u.closed_at is not null then 'closed' else 'done' end as stage
       from ursp_targets u
      where u.status = 'sent' and u.done_at is not null
        and not exists (select 1 from nff_targets n where n.store_domain = u.store_domain)
      order by u.done_at`,
  ).catch(() => ({ rows: [] }));
  let added = 0;
  for (const r of rows) {
    const ins = await p.query<{ id: string }>(
      `insert into nff_targets (store_domain, store_name, email, session_id, ticket_link, ursp_id, ursp_stage, status, message)
       values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8) on conflict (store_domain) do nothing returning id`,
      [r.store_domain, r.store_name, r.email, r.session_id, r.ticket_link, r.id, r.stage, composeMessage(r, cfg)],
    );
    if (ins.rows[0]) {
      added++;
      await logEvent(ins.rows[0].id, "queued", "system", { from: `Upsell Responsive · ${r.stage === "closed" ? "Kết thúc" : "Đã xử lý"}` });
    }
  }
  return added;
}

/* Bump when the built-in message changes: the messages still on Chờ duyệt are written again, once. */
const MSG_VERSION = "bold-v2";

/** The built-in message changed since the drafts were written: rewrite them (a custom template is left alone). */
export async function refreshDrafts(): Promise<number> {
  if ((await getState<string>("msg_version")) === MSG_VERSION) return 0;
  const n = (await getNffSettings()).template.trim() ? 0 : await recompose();
  await setState("msg_version", MSG_VERSION);
  return n;
}

/** The template changed: what still waits on Chờ duyệt is written again. */
export async function recompose(): Promise<number> {
  const cfg = await getNffSettings();
  const p = await db();
  const { rows } = await p.query<NffTarget>(`select * from nff_targets where status = 'pending'`);
  for (const t of rows) await p.query(`update nff_targets set message = $2, updated_at = now() where id = $1`, [t.id, composeMessage(t, cfg)]);
  return rows.length;
}

/* ---------------------------------------------------------------- send */

async function quiet(sid: string, minutes: number): Promise<boolean> {
  if (!minutes) return true;
  const msgs = await conversationMessages(sid).catch(() => []);
  const last = Math.max(0, ...msgs.map((m) => m.timestamp ?? 0));
  return Date.now() - last > minutes * 60_000;
}

export type SendResult = { sent: number; waited: number; failed: number };

export async function runSend(): Promise<SendResult> {
  const out: SendResult = { sent: 0, waited: 0, failed: 0 };
  if (!hasNffDatabase()) return out;
  const cfg = await getNffSettings();
  const p = await db();
  const { rows } = await p.query<NffTarget>(`select * from nff_targets where status = 'approved' order by updated_at limit 20`);
  if (!rows.length) return out;
  const sender = await crispSender(cfg.sender_name, "");
  for (const t of rows) {
    try {
      if (!t.message?.trim()) throw new Error("Tin nhắn trống");
      /* the store's latest conversation, read now; else the one the responsive case used */
      let sid = t.session_id;
      if (t.email) {
        const latest = (await reviewCheck(t.email).catch(() => null))?.conversations[0]?.session_id ?? null;
        if (latest && latest !== sid) {
          sid = latest;
          await p.query(`update nff_targets set session_id = $2, ticket_link = $3 where id = $1`, [t.id, sid, ticketLink(await connection("crisp_website_id"), sid)]);
        }
      }
      if (!sid) throw new Error("Store chưa có hội thoại Crisp");
      if (!(await quiet(sid, cfg.quiet_minutes))) {
        out.waited++;
        continue;
      }
      await sendInConversation(sid, t.message, sender);
      await sendNote(
        sid,
        `[Feedback New Feature] ${cfg.sender_name} introduced PageFly's new features (Funnel Builder, Bundles, Post-purchase offer) to this customer. FL: please continue to support and guide the customer when they reply.`,
      );
      await resolveConversation(sid).catch(() => undefined);
      await p.query(`update nff_targets set status = 'sent', sent_at = now(), error = null, updated_at = now() where id = $1`, [t.id]);
      await logEvent(t.id, "sent", t.approved_by ?? "system");
      out.sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await p.query(`update nff_targets set status = 'failed', error = $2, updated_at = now() where id = $1`, [t.id, msg]);
      await logEvent(t.id, "send_failed", "system", { error: msg });
      out.failed++;
    }
  }
  return out;
}

/* ---------------------------------------------------------------- track */

const textOf = (c: unknown) => (typeof c === "string" ? c : "");

export async function track(t: NffTarget): Promise<void> {
  if (!t.session_id || !t.sent_at) return;
  const p = await db();
  const msgs = await conversationMessages(t.session_id);
  const since = new Date(t.sent_at).getTime() - 60_000;
  const ours = msgs.filter((m) => m.from === "operator" && m.type === "text" && (m.timestamp ?? 0) >= since);
  const readAt = ours.find((m) => m.read)?.timestamp ?? null;
  const theirs = msgs.filter((m) => m.from === "user" && (m.timestamp ?? 0) >= since && textOf(m.content).trim());
  const seen = Math.max(t.reply_seen_at ? new Date(t.reply_seen_at).getTime() : 0, t.last_reply_at ? new Date(t.last_reply_at).getTime() : 0);
  const fresh = theirs.filter((m) => (m.timestamp ?? 0) > seen);
  const sets: string[] = ["tracked_at = now()", "updated_at = now()"];
  const args: unknown[] = [t.id];
  const set = (col: string, v: unknown) => {
    args.push(v);
    sets.push(`${col} = $${args.length}`);
  };
  if (readAt && !t.read_at) set("read_at", new Date(readAt).toISOString());
  if (fresh.length) {
    const last = fresh[fresh.length - 1];
    set("reply_seen_at", new Date(last.timestamp!).toISOString());
    const read = await readReply(t.message ?? "", fresh.map((m) => textOf(m.content)).join("\n---\n"));
    if (read.related && read.excerpt.trim()) {
      set("last_reply_at", new Date(last.timestamp!).toISOString());
      set("last_reply_text", read.excerpt.slice(0, 1000));
      set("replies", (t.replies ?? 0) + 1);
      set("interest", read.interest);
      set("mood", read.mood);
      set("mood_note", read.note || null);
      if (!t.replied_at) set("replied_at", new Date(last.timestamp!).toISOString());
      await sendNote(
        t.session_id,
        `[Feedback New Feature] The customer replied about the new features: "${read.excerpt.slice(0, 300)}"${read.note ? ` (${read.note})` : ""}. FL: please continue to support and guide the customer.`,
      ).catch(() => undefined);
      if (!t.mentioned_at) set("mentioned_at", new Date().toISOString());
      await logEvent(t.id, "reply", "system", { interest: read.interest, mood: read.mood, by: read.by });
    }
  }
  await p.query(`update nff_targets set ${sets.join(", ")} where id = $1`, args);
}

async function trackDue(cfg: NffSettings): Promise<{ tracked: number; errors: string[] }> {
  const p = await db();
  const { rows } = await p.query<NffTarget>(
    `select * from nff_targets where status = 'sent' and session_id is not null
       and sent_at > now() - make_interval(days => $1::int)
       and (tracked_at is null or tracked_at < now() - make_interval(secs => $2::int))
     order by tracked_at nulls first limit 40`,
    [cfg.tracking_days, Math.round(TRACK_EVERY_MS / 1000) - 60],
  );
  const errors: string[] = [];
  for (const t of rows) await track(t).catch((err) => errors.push(`${t.store_domain}: ${err instanceof Error ? err.message : err}`));
  return { tracked: rows.length, errors };
}

/* ---------------------------------------------------------------- job */

export type JobState = { at: string; added?: number; tracked?: number; send?: SendResult; errors: string[] };

let busy = false;

export async function runJob(force = false): Promise<JobState | null> {
  if (busy || !hasNffDatabase()) return null;
  busy = true;
  const state: JobState = { at: new Date().toISOString(), errors: [] };
  try {
    const cfg = await getNffSettings();
    const clock = (await getState<Record<string, string>>("clock")) ?? {};
    if (force || !clock.collect || Date.now() - new Date(clock.collect).getTime() >= COLLECT_EVERY_MS) {
      await refreshDrafts().catch((err) => state.errors.push(`drafts: ${err instanceof Error ? err.message : err}`));
      state.added = await collect().catch((err) => (state.errors.push(`collect: ${err instanceof Error ? err.message : err}`), 0));
      clock.collect = state.at;
    }
    state.send = await runSend().catch((err) => (state.errors.push(`send: ${err instanceof Error ? err.message : err}`), undefined));
    const tr = await trackDue(cfg);
    state.tracked = tr.tracked;
    state.errors.push(...tr.errors.slice(0, 5));
    await setState("clock", clock);
    await setState("last_job", state);
    return state;
  } finally {
    busy = false;
  }
}

let started = false;

export function startNffTimer(): void {
  if (started || !hasNffDatabase() || process.env.NFF_DISABLE_TIMER === "1") return;
  started = true;
  const tick = () => void runJob().catch((err) => console.error("[nff] run failed", err));
  setTimeout(tick, 100_000).unref?.();
  setInterval(tick, TICK_MS).unref?.();
}

/* ---------------------------------------------------------------- admin */

export type TargetAction = "approve" | "edit" | "skip" | "retry" | "track" | "unskip";

export async function targetAction(id: string, action: TargetAction, by: string, text?: string): Promise<void> {
  const p = await db();
  const { rows } = await p.query<NffTarget>("select * from nff_targets where id = $1", [id]);
  const t = rows[0];
  if (!t) throw new UpsellError("Không tìm thấy store này.", 404);
  const body = text?.trim();
  const upd = (sql: string, ...args: unknown[]) => p.query(`update nff_targets set ${sql}, updated_at = now() where id = $1`, [id, ...args]);
  switch (action) {
    case "approve":
      if (t.status !== "pending") throw new UpsellError("Tin này không còn ở Chờ duyệt.", 409);
      await upd("status = 'approved', approved_by = $2, message = coalesce($3, message)", by, body || null);
      break;
    case "edit":
      if (!body) throw new UpsellError("Nội dung trống.", 422);
      await upd("message = $2", body);
      break;
    case "skip":
      if (t.status === "sent") throw new UpsellError("Tin đã gửi rồi.", 409);
      await upd("status = 'skipped'");
      break;
    case "unskip":
      if (t.status !== "skipped") throw new UpsellError("Store này không ở Bỏ qua.", 409);
      await upd("status = 'pending'");
      break;
    case "retry":
      if (t.status !== "failed") throw new UpsellError("Chỉ gửi lại được tin bị lỗi.", 409);
      await upd("status = 'approved', error = null");
      break;
    case "track":
      await track(t);
      break;
  }
  await logEvent(id, action, by, body ? { text: body.slice(0, 200) } : null);
  if (action === "approve" || action === "retry") void runSend().catch((err) => console.error("[nff] send after approve", err));
}

/** Duyệt & gửi tất cả: every message on Chờ duyệt, as written. */
export async function approveAll(by: string): Promise<number> {
  const p = await db();
  const r = await p.query(`update nff_targets set status = 'approved', approved_by = $1, updated_at = now() where status = 'pending'`, [by]);
  void runSend().catch((err) => console.error("[nff] send after approve all", err));
  return r.rowCount ?? 0;
}
