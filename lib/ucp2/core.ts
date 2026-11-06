import "server-only";

import { ConfigMissing, ac2Store, ac2UpgradeTime, conversationMessages, reviewCheck } from "@/lib/storeSetUpsell/clients";
import { UpsellError } from "@/lib/upsell/types";
import { db, getState, hasUcp2Database, logEvent, setState, tx, type Db } from "./db";

/* ==========================================================================
   Upsell Collection Pages 2: the rows n8n posts in from the sheet, the
   click link, and what the job finds out about each row afterwards.

     import   POST /api/ucp2/rows — the sheet's rows as n8n's Google Sheets
              node gives them ({"Time", "Code Store", "Store Domain", …}).
              Keyed by the Crisp session in "Ticket": posting the whole tab
              again changes nothing but what the sheet changed.
     click    /go/{Code Store} — counted, then on to the page the message
              meant (?to=, a pagefly.io address only)
     track    every row sent in the last TRACK_DAYS days, a batch at a time:
                Crisp   our message delivered / read, the customer's replies
                Crisp   app_review on any of their conversations (5★ → review)
                AC2     paid plan now and on Free when sent → upgrade; uninstall
                PFD     a template downloaded from Collection pages since
     pull     GET /api/ucp2/rows — each row's outcome, with the sheet's PFD
              columns already written out, for n8n to put back
   ========================================================================== */

export const TRACK_DAYS = 60;
const TRACK_BATCH = 25;
const CRISP_EVERY_MS = 20 * 60_000;
const SLOW_EVERY_MS = 6 * 60 * 60_000;
const VN_OFFSET = "+07:00";

/** The columns this side owns in the sheet, in order, after the sheet's own. */
export const SHEET_COLUMNS = [
  "PFD Đã đọc",
  "PFD Click link",
  "PFD Số click",
  "PFD Tải template",
  "PFD Phản hồi",
  "PFD Nội dung phản hồi",
  "PFD Nâng cấp",
  "PFD Review",
  "PFD Gỡ app",
  "PFD Cập nhật",
] as const;

export type Ucp2Row = {
  session_id: string;
  sent_at: string;
  code: string | null;
  store_domain: string;
  email: string | null;
  store_name: string | null;
  plan: string | null;
  type_user: string | null;
  ticket_link: string | null;
  imported_at: string;
  pf_plan: string | null;
  pf_price: string | null;
  app_status: string | null;
  delivered_at: string | null;
  read_at: string | null;
  clicked_at: string | null;
  clicks: number;
  downloaded_at: string | null;
  replied_at: string | null;
  last_reply_at: string | null;
  last_reply_text: string | null;
  replies: number;
  upgraded_at: string | null;
  upgraded_to: string | null;
  upgraded_price: string | null;
  reviewed_at: string | null;
  app_review: number | null;
  reviewed_before: boolean;
  uninstalled_at: string | null;
  first_price: string | null;
  first_ac2_at: string | null;
  crisp_checked_at: string | null;
  review_checked_at: string | null;
  ac2_checked_at: string | null;
  tracked_at: string | null;
  changed_at: string;
};

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

/* ---------------------------------------------------------------- import */

export const sessionOf = (ticket: unknown): string | null => str(ticket)?.match(/session_[0-9a-f-]{36}/i)?.[0].toLowerCase() ?? null;

const domainOf = (v: unknown): string | null =>
  str(v)
    ?.toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "") || null;

/** "2026-10-05 8:00:28" in the sheet is Vietnam time. */
export function sheetTime(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const p2 = (x: string) => x.padStart(2, "0");
    const d = new Date(`${m[1]}-${p2(m[2])}-${p2(m[3])}T${p2(m[4])}:${m[5]}:${m[6] ?? "00"}${VN_OFFSET}`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A field by any of its names, as the sheet heads it or as a script might. */
function pick(r: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) if (r[n] !== undefined && r[n] !== "") return r[n];
  const lower = new Map(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v]));
  for (const n of names) {
    const v = lower.get(n.toLowerCase());
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

export type ImportResult = { received: number; added: number; updated: number; skipped: { row: number; reason: string }[] };

export async function importRows(input: unknown, actor = "n8n"): Promise<ImportResult> {
  const list = Array.isArray(input) ? input : input && typeof input === "object" && Array.isArray((input as { rows?: unknown }).rows) ? (input as { rows: unknown[] }).rows : null;
  if (!list) throw new UpsellError('Gửi một mảng row, hoặc {"rows": [...]}.', 422);
  if (list.length > 5000) throw new UpsellError("Tối đa 5000 row một lần.", 422);
  const out: ImportResult = { received: list.length, added: 0, updated: 0, skipped: [] };
  await tx(async (c) => {
    for (const [i, raw] of list.entries()) {
      const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      const ticket = str(pick(r, "Ticket", "ticket", "ticket_link"));
      const session = sessionOf(ticket);
      const domain = domainOf(pick(r, "Store Domain", "store_domain", "domain"));
      const at = sheetTime(pick(r, "Time", "time", "sent_at"));
      if (!session || !domain || !at) {
        out.skipped.push({ row: Number(pick(r, "row_number", "row")) || i + 1, reason: !session ? "Ticket không có session Crisp" : !domain ? "Thiếu Store Domain" : "Time không đọc được" });
        continue;
      }
      const vals = [
        session,
        at,
        str(pick(r, "Code Store", "code")),
        domain,
        str(pick(r, "Email", "email"))?.toLowerCase() ?? null,
        str(pick(r, "Tên store", "store_name")),
        str(pick(r, "Plan", "plan")),
        str(pick(r, "Type User", "type_user")),
        ticket,
      ];
      const res = await c.query<{ inserted: boolean }>(
        `insert into ucp2_rows (session_id, sent_at, code, store_domain, email, store_name, plan, type_user, ticket_link)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (session_id) do update set
           sent_at = excluded.sent_at, code = excluded.code, store_domain = excluded.store_domain,
           email = excluded.email, store_name = excluded.store_name, plan = excluded.plan,
           type_user = excluded.type_user, ticket_link = excluded.ticket_link
         where (ucp2_rows.sent_at, ucp2_rows.code, ucp2_rows.store_domain, ucp2_rows.email, ucp2_rows.store_name,
                ucp2_rows.plan, ucp2_rows.type_user, ucp2_rows.ticket_link)
               is distinct from
               (excluded.sent_at, excluded.code, excluded.store_domain, excluded.email, excluded.store_name,
                excluded.plan, excluded.type_user, excluded.ticket_link)
         returning (xmax = 0) as inserted`,
        vals,
      );
      if (!res.rows[0]) continue;
      if (res.rows[0].inserted) {
        out.added++;
        await logEvent(c, session, "imported", actor, { domain, type_user: vals[7] });
      } else out.updated++;
    }
  });
  await setState("imported", { at: new Date().toISOString(), ...out, skipped: out.skipped.length });
  return out;
}

/* ---------------------------------------------------------------- click */

const DEFAULT_TARGET = "/collection-pages";

/** Where a click goes: ?to= when it is a path on this site or a pagefly.io
    address, else Collection pages. A path stays relative: behind nginx this
    process does not know its public host, and the browser does. */
export function clickTarget(to: string | null): string {
  if (to) {
    if (/^\/(?![\/\\])/.test(to)) return to;
    try {
      const u = new URL(to);
      if (u.protocol === "https:" && (u.hostname === "pagefly.io" || u.hostname.endsWith(".pagefly.io"))) return u.toString();
    } catch {
      /* not a URL: the default */
    }
  }
  return DEFAULT_TARGET;
}

/** Count a click on /go/{code}. The latest row for that code (or store), if any. */
export async function recordClick(code: string, meta: { to: string | null; ua: string | null }): Promise<string | null> {
  const key = code.trim().toLowerCase();
  if (!key || key.length > 200 || !hasUcp2Database()) return null;
  return tx(async (c) => {
    const { rows } = await c.query<{ session_id: string; clicked_at: string | null }>(
      `select session_id, clicked_at from ucp2_rows
        where lower(code) = $1 or store_domain = $1 or store_domain = $1 || '.myshopify.com'
        order by sent_at desc limit 1 for update`,
      [key],
    );
    const row = rows[0];
    if (!row) return null;
    /* A link preview (Slack, iMessage, Crisp's own) fetches it too: counted
       as a click it would mark every row clicked the moment it was sent. */
    if (meta.ua && /bot|crawler|spider|preview|facebookexternalhit|slackbot|whatsapp|telegram|discord|curl|wget/i.test(meta.ua)) return row.session_id;
    await c.query(
      `update ucp2_rows set clicks = clicks + 1, clicked_at = coalesce(clicked_at, now()), changed_at = now() where session_id = $1`,
      [row.session_id],
    );
    await logEvent(c, row.session_id, "clicked", "customer", { to: meta.to });
    return row.session_id;
  });
}

/* ---------------------------------------------------------------- track */

const textOf = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" ? JSON.stringify(v) : String(v ?? ""));
const age = (t: string | null) => (t ? Date.now() - new Date(t).getTime() : Infinity);

/** Collection pages downloads by this store since the row was sent (the table lives in the same database). */
async function downloadedSince(c: Db, domain: string, since: string): Promise<string | null> {
  const has = await c.query<{ t: string | null }>("select to_regclass('collection_leads')::text as t");
  if (!has.rows[0]?.t) return null;
  const { rows } = await c.query<{ at: string | null }>(
    `select min(created_at) as at from collection_leads where lower(domain) = $1 and created_at >= $2`,
    [domain, since],
  );
  return rows[0]?.at ?? null;
}

export async function trackOne(row: Ucp2Row, opts: { force?: boolean; actor?: string } = {}): Promise<void> {
  const actor = opts.actor ?? "system";
  const sent = new Date(row.sent_at).getTime();
  const patch: Record<string, unknown> = {};
  const events: [string, Record<string, unknown>][] = [];
  const errors: string[] = [];

  /* Crisp: our message — the last operator text at or after the row's time —
     delivered and read; anything the customer wrote after it. */
  if (opts.force || age(row.crisp_checked_at) > CRISP_EVERY_MS) {
    try {
      const msgs = await conversationMessages(row.session_id);
      const ours = msgs.filter((m) => m.from === "operator" && m.type === "text" && Number(m.timestamp) >= sent - 10 * 60_000);
      if (!row.delivered_at && ours.some((m) => m.delivered || m.read)) {
        patch.delivered_at = new Date().toISOString();
        events.push(["delivered", {}]);
      }
      if (!row.read_at && ours.some((m) => m.read)) {
        patch.read_at = new Date().toISOString();
        events.push(["read", {}]);
      }
      const replies = msgs.filter((m) => m.from === "user" && Number(m.timestamp) >= sent);
      if (replies.length) {
        const first = new Date(Math.floor(Number(replies[0].timestamp) / 1000) * 1000).toISOString();
        const lastSec = Math.floor(Number(replies[replies.length - 1].timestamp) / 1000);
        if (!row.replied_at) patch.replied_at = first;
        if (replies.length !== row.replies) patch.replies = replies.length;
        if (!row.last_reply_at || lastSec > Math.floor(new Date(row.last_reply_at).getTime() / 1000)) {
          const text = replies
            .slice(-5)
            .map((m) => textOf(m.content))
            .join("\n")
            .slice(0, 1500);
          Object.assign(patch, { last_reply_at: new Date(lastSec * 1000).toISOString(), last_reply_text: text });
          events.push(["replied", { text: text.slice(0, 300) }]);
        }
      }
      patch.crisp_checked_at = new Date().toISOString();
    } catch (err) {
      if (err instanceof ConfigMissing) throw err;
      errors.push(`Crisp: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /* The slow checks, a few times a day: app_review on Crisp, the store on AC2. */
  if (row.email && !row.reviewed_at && !row.reviewed_before && (opts.force || age(row.review_checked_at) > SLOW_EVERY_MS)) {
    try {
      const r = await reviewCheck(row.email);
      patch.review_checked_at = new Date().toISOString();
      if (r.app_review !== null && r.app_review !== row.app_review) patch.app_review = r.app_review;
      if (r.app_review !== null && r.app_review >= 5 && !row.reviewed_before) {
        /* 5★ at the first look, the day the message went: they had reviewed
           before it — not a review this message brought. */
        if (!row.review_checked_at && Date.now() - sent < 24 * 60 * 60_000) {
          patch.reviewed_before = true;
          events.push(["reviewed_before", { app_review: r.app_review }]);
        } else {
          patch.reviewed_at = new Date().toISOString();
          events.push(["reviewed", { app_review: r.app_review }]);
        }
      }
    } catch (err) {
      if (err instanceof ConfigMissing) throw err;
      errors.push(`Review: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (opts.force || age(row.ac2_checked_at) > SLOW_EVERY_MS) {
    const st = await ac2Store(row.store_domain).catch(() => null);
    if (st) {
      const price = Number(st.pageflyPrice ?? 0) || 0;
      const plan = str(st.pageflyPlan) ?? "Free";
      Object.assign(patch, { pf_plan: plan, pf_price: price, app_status: str(st.status), ac2_checked_at: new Date().toISOString() });
      if (row.first_price === null) Object.assign(patch, { first_price: price, first_ac2_at: new Date().toISOString() });
      /* An upgrade is a paid plan AC2 activated after the message. Without
         that time, only a store AC2 itself saw on Free the day the message
         went — the sheet's Plan says Free for stores paying for years. */
      if (!row.upgraded_at && price > 0) {
        const at = await ac2UpgradeTime(row.store_domain, row.sent_at).catch(() => null);
        const firstFree =
          row.first_price !== null && Number(row.first_price) === 0 && row.first_ac2_at !== null && new Date(row.first_ac2_at).getTime() - sent < 24 * 60 * 60_000;
        if (at || firstFree) {
          Object.assign(patch, { upgraded_at: at ?? new Date().toISOString(), upgraded_to: plan, upgraded_price: price });
          events.push(["upgraded", { to: plan, price, at }]);
        }
      }
      if (!row.uninstalled_at && str(st.status) === "uninstalled") {
        const at = str(st.uninstalledAt);
        if (!at || new Date(at).getTime() >= sent) {
          patch.uninstalled_at = at ?? new Date().toISOString();
          events.push(["uninstalled", {}]);
        }
      }
    } else patch.ac2_checked_at = new Date().toISOString();
  }

  await tx(async (c) => {
    if (!row.downloaded_at) {
      const at = await downloadedSince(c, row.store_domain, row.sent_at);
      if (at) {
        patch.downloaded_at = at;
        events.push(["downloaded", {}]);
      }
    }
    const keys = Object.keys(patch);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    /* changed_at moves only with something the sheet shows. */
    if (events.length || "app_review" in patch || "replies" in patch) sets.push("changed_at = now()");
    await c.query(`update ucp2_rows set ${[...sets, "tracked_at = now()"].join(", ")} where session_id = $1`, [row.session_id, ...keys.map((k) => patch[k])]);
    for (const [type, detail] of events) await logEvent(c, row.session_id, type, actor, detail);
    if (errors.length) await logEvent(c, row.session_id, "track_failed", actor, { errors });
  });
}

export type TrackState = { at: string; tracked: number; errors: string[]; remaining: number };

let running: Promise<TrackState> | null = null;

/** One batch: the rows checked longest ago first. */
export function runTrack(): Promise<TrackState> {
  if (!running) running = trackBatch().finally(() => (running = null));
  return running;
}

async function trackBatch(): Promise<TrackState> {
  const out: TrackState = { at: new Date().toISOString(), tracked: 0, errors: [], remaining: 0 };
  const p = await db();
  const { rows } = await p.query<Ucp2Row>(
    `select * from ucp2_rows
      where sent_at > now() - make_interval(days => $1)
        and (tracked_at is null or tracked_at < now() - interval '15 minutes')
      order by tracked_at nulls first, sent_at desc limit $2`,
    [TRACK_DAYS, TRACK_BATCH],
  );
  for (const r of rows) {
    try {
      await trackOne(r);
      out.tracked++;
    } catch (err) {
      out.errors.push(err instanceof Error ? err.message : String(err));
      if (err instanceof ConfigMissing) break;
    }
  }
  const left = await p.query<{ n: number }>(
    `select count(*)::int as n from ucp2_rows
      where sent_at > now() - make_interval(days => $1) and (tracked_at is null or tracked_at < now() - interval '15 minutes')`,
    [TRACK_DAYS],
  );
  out.remaining = left.rows[0]?.n ?? 0;
  out.errors = [...new Set(out.errors)];
  await setState("tracked", out).catch(() => undefined);
  return out;
}

const TICK_MS = 2 * 60_000;
let started = false;

/** Every two minutes, from instrumentation.ts. Postgres only; off with UCP2_DISABLE_TIMER=1. */
export function startUcp2Timer(): void {
  if (started || !hasUcp2Database() || process.env.UCP2_DISABLE_TIMER === "1") return;
  started = true;
  const run = () =>
    runTrack().then(
      (r) => {
        if (r.errors.length) console.error("[ucp2]", JSON.stringify(r));
      },
      (err) => console.error("[ucp2] run failed", err),
    );
  setTimeout(run, 60_000).unref?.();
  setInterval(run, TICK_MS).unref?.();
}

/* ---------------------------------------------------------------- pull */

const VN_FMT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
export const vnTime = (t: string | null) => (t ? VN_FMT.format(new Date(t)) : "");

/** A row's cells for the sheet's PFD columns, in SHEET_COLUMNS order's names. */
export function sheetCells(r: Ucp2Row): Record<(typeof SHEET_COLUMNS)[number], string> {
  return {
    "PFD Đã đọc": vnTime(r.read_at),
    "PFD Click link": vnTime(r.clicked_at),
    "PFD Số click": r.clicks ? String(r.clicks) : "",
    "PFD Tải template": vnTime(r.downloaded_at),
    "PFD Phản hồi": vnTime(r.replied_at),
    "PFD Nội dung phản hồi": (r.last_reply_text ?? "").slice(0, 500),
    "PFD Nâng cấp": r.upgraded_at ? `${vnTime(r.upgraded_at)} · ${r.upgraded_to ?? ""}${r.upgraded_price ? ` $${Number(r.upgraded_price)}` : ""}` : "",
    "PFD Review": r.reviewed_at ? `${vnTime(r.reviewed_at)} · ${r.app_review ?? 5}★` : r.app_review !== null ? `${r.app_review}★` : "",
    "PFD Gỡ app": vnTime(r.uninstalled_at),
    "PFD Cập nhật": vnTime(r.changed_at),
  };
}

/** For n8n: every row (or those changed since `since`), keyed by its Ticket. */
export async function pullRows(since: string | null): Promise<{ columns: readonly string[]; rows: (Record<string, string> & { session_id: string; Ticket: string; "Store Domain": string })[] }> {
  const p = await db();
  const sinceAt = since && !Number.isNaN(new Date(since).getTime()) ? new Date(since).toISOString() : null;
  const { rows } = await p.query<Ucp2Row>(
    `select * from ucp2_rows ${sinceAt ? "where changed_at >= $1" : ""} order by sent_at`,
    sinceAt ? [sinceAt] : [],
  );
  await setState("pulled", { at: new Date().toISOString(), rows: rows.length, since: sinceAt }).catch(() => undefined);
  return {
    columns: SHEET_COLUMNS,
    rows: rows.map((r) => ({ session_id: r.session_id, Ticket: r.ticket_link ?? "", "Store Domain": r.store_domain, ...sheetCells(r) })),
  };
}

export { getState };
