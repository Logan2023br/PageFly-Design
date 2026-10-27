import "server-only";

import { ConfigMissing, MixpanelBusy, ac2Store, ac2UpgradeTime, addSegment, conversationMessages, exportStoreSetSelects, reviewCheck, type Ac2Store, type MixpanelEvent } from "./clients";
import { db, hasStoreSetDatabase, logEvent, tx } from "./db";
import { daysLeft, draft, loadSetNames, sendOne } from "./messages";
import { getInternal, getSsuSettings, setInternal, type SsuSettings } from "./settings";
import type { CareKind, SsuCustomer, SsuJobState } from "./types";
import { UpsellError } from "@/lib/upsell/types";

/* ==========================================================================
   The job, every minute (instrumentation.ts starts it; "Cập nhật ngay" on the
   screen runs it on demand):

     1. read      Mixpanel `select_template` with a store_set since the last
                  read (10 minutes of overlap; $insert_id deduplicates)
     2. check     each new store: AC2 for the store, Crisp for every
                  conversation with its email and their app_review
     3. decide    5★ → never messaged; no email / dev store / uninstalled →
                  skipped; otherwise a thanks message, waiting for an admin
                  (manual) or approved already (auto)
     4. track     every 10 minutes, sent customers: delivered / read /
                  replies (a new reply → "Cần kiểm tra"), app_review again
                  (→ "Đã review"), AC2 again (upgrade, pages, uninstall)
     5. care      sent, no reply, no 5★: one care message at a time
                  (upgraded → read → days left), per `care_mode`
     6. send      approved messages, from Logan, on Crisp
     7. refresh   AC2 for every store once a day, for the stats table

   ONE THANKS PER STORE, EVER: a store that selects again — the same set, or
   another — is recorded (its sets, its pages, its count) and nothing more.
   The decision is made once, for a store still `new`; the unique index on
   (store, kind) holds it even if two runs overlap.

   One run at a time per process; every step is idempotent, so a run cut
   short is finished by the next.
   ========================================================================== */

const CHECK_BATCH = 15;
const SEND_BATCH = 10;
const TRACK_BATCH = 30;
const TRACK_EVERY_MS = 10 * 60_000;
const RECHECK_MS = 60 * 60_000;

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const domainOf = (v: unknown): string | null => str(v)?.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") ?? null;

/* ---------------------------------------------------------------- 1. read */

export async function ingest(events: MixpanelEvent[]): Promise<{ new_selections: number; new_customers: number }> {
  let newSel = 0;
  let newCust = 0;
  for (const e of events) {
    const p = e.properties ?? {};
    const insertId = str(p.$insert_id) ?? `${str(p.distinct_id)}:${p.time}:${str(p.template_id)}`;
    const domain = domainOf(p.shopify_domain);
    const email = str(p.email)?.toLowerCase() ?? null;
    const at = new Date(Number(p.time) * 1000).toISOString();
    const set = str(p.store_set);
    if (!set) continue;
    await tx(async (c) => {
      const ins = await c.query(
        `insert into ssu_selections (insert_id, event_time, store_domain, email, store_set, template_id, template_type, page_type,
            min_plan, is_locked, is_dev_store, source, country, region, city, browser, os, editor_version, distinct_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         on conflict (insert_id) do nothing returning id`,
        [
          insertId,
          at,
          domain,
          email,
          set,
          str(p.template_id),
          str(p.template_type),
          str(p.page_type),
          str(p.min_plan),
          bool(p.is_locked),
          bool(p.is_dev_store),
          str(p.source),
          str(p.mp_country_code),
          str(p.$region),
          str(p.$city),
          str(p.$browser),
          str(p.$os),
          str(p.editor_version),
          str(p.distinct_id),
        ],
      );
      if (!ins.rows[0]) return;
      newSel++;
      /* A select without a store cannot be messaged or tracked: it stays in
         the feed, and makes no customer. */
      if (!domain) return;
      const up = await c.query<{ inserted: boolean }>(
        `insert into ssu_customers (store_domain, email, country, city, is_dev_store, sets, selections, first_selected_at, last_selected_at)
         values ($1, $2, $3, $4, $5, array[$6]::text[], 1, $7, $7)
         on conflict (store_domain) do update set
           email = coalesce(ssu_customers.email, excluded.email),
           country = coalesce(ssu_customers.country, excluded.country),
           city = coalesce(ssu_customers.city, excluded.city),
           is_dev_store = coalesce(excluded.is_dev_store, ssu_customers.is_dev_store),
           sets = case when $6 = any(ssu_customers.sets) then ssu_customers.sets else ssu_customers.sets || $6 end,
           selections = ssu_customers.selections + 1,
           first_selected_at = least(ssu_customers.first_selected_at, excluded.first_selected_at),
           last_selected_at = greatest(ssu_customers.last_selected_at, excluded.last_selected_at),
           updated_at = now()
         returning (xmax = 0) as inserted`,
        [domain, email, str(p.mp_country_code), str(p.$city), bool(p.is_dev_store), set, at],
      );
      if (up.rows[0]?.inserted) newCust++;
      await logEvent(c, domain, "selected", "mixpanel", {
        store_set: set,
        template_id: str(p.template_id),
        page_type: str(p.page_type),
        at,
      });
    });
  }
  return { new_selections: newSel, new_customers: newCust };
}

async function read(cfg: SsuSettings, out: SsuJobState): Promise<void> {
  const pause = await getInternal<string>("mixpanel_pause");
  if (pause && new Date(pause).getTime() > Date.now()) return;
  const cursor = await getInternal<string>("cursor");
  const since = cursor
    ? new Date(new Date(cursor).getTime() - 10 * 60_000)
    : new Date(Date.now() - Math.max(1, cfg.backfill_days) * 86_400_000);
  let events: MixpanelEvent[];
  try {
    events = await exportStoreSetSelects(since);
  } catch (err) {
    if (err instanceof MixpanelBusy) await setInternal("mixpanel_pause", new Date(Date.now() + 5 * 60_000).toISOString());
    throw err;
  }
  out.fetched = events.length;
  Object.assign(out, await ingest(events));
  const latest = events.reduce((m, e) => Math.max(m, Number(e.properties.time) * 1000 || 0), 0);
  /* Never moves backwards, and moves to "now − 10 min" when the read was
     empty so the window does not grow for ever on a quiet day. */
  const next = Math.max(latest, cursor ? new Date(cursor).getTime() : 0, Date.now() - 10 * 60_000);
  await setInternal("cursor", new Date(next).toISOString());
}

/* ---------------------------------------------------------------- 2. check + 3. decide */

function ac2Fields(st: Ac2Store) {
  return {
    store_name: str(st.name),
    email: str(st.email)?.toLowerCase() ?? null,
    phone: str(st.phone),
    country: str(st.country),
    timezone: str(st.timezone),
    shopify_plan: str(st.shopifyPlan),
    pf_plan: str(st.pageflyPlan) ?? "Free",
    pf_price: num(st.pageflyPrice) ?? 0,
    pages: num(st.totalPages),
    published: num(st.numPublished),
    app_status: str(st.status),
    installed_at: str(st.createdAt),
    uninstalled_at: str(st.uninstalledAt),
  };
}

async function writeAc2(domain: string, st: Ac2Store): Promise<void> {
  const f = ac2Fields(st);
  const p = await db();
  await p.query(
    `update ssu_customers set
        store_name = coalesce($2, store_name), email = coalesce(email, $3), phone = coalesce($4, phone),
        country = coalesce($5, country), timezone = coalesce($6, timezone), shopify_plan = coalesce($7, shopify_plan),
        pf_plan = $8, pf_price = $9, pages = coalesce($10, pages), published = coalesce($11, published),
        app_status = coalesce($12, app_status), installed_at = coalesce($13::timestamptz, installed_at),
        uninstalled_at = $14::timestamptz, ac2_synced_at = now(), updated_at = now()
      where store_domain = $1`,
    [domain, f.store_name, f.email, f.phone, f.country, f.timezone, f.shopify_plan, f.pf_plan, f.pf_price, f.pages, f.published, f.app_status, f.installed_at, f.uninstalled_at],
  );
}

async function writeReview(domain: string, r: Awaited<ReturnType<typeof reviewCheck>>): Promise<void> {
  const p = await db();
  await p.query(
    `update ssu_customers set crisp_checked_at = now(), crisp_conversations = $2, crisp_sessions = $3::jsonb,
            app_review = $4, updated_at = now()
      where store_domain = $1`,
    [domain, r.conversations.length, JSON.stringify(r.conversations.slice(0, 20)), r.app_review],
  );
}

async function load(domain: string): Promise<SsuCustomer | null> {
  const p = await db();
  const { rows } = await p.query<SsuCustomer>("select * from ssu_customers where store_domain = $1", [domain]);
  return rows[0] ?? null;
}

/** Why this customer gets no message, or null when they may get one. */
export function skipReason(cu: SsuCustomer, cfg: SsuSettings): { status: "reviewed" | "skipped"; reason: string } | null {
  if (cu.app_review !== null && Number(cu.app_review) >= 5) return { status: "reviewed", reason: "Đã review 5★ trên Crisp" };
  if (!cu.email) return { status: "skipped", reason: "Không có email" };
  if (cu.app_status && cu.app_status !== "installed") return { status: "skipped", reason: `App ${cu.app_status}` };
  if (cfg.skip_dev_stores && (cu.is_dev_store || /development|partner|staff|affiliate/i.test(cu.shopify_plan ?? "")))
    return { status: "skipped", reason: "Store development / partner" };
  return null;
}

/** Writes the thanks message if the mode says so, else marks them eligible. */
export async function decide(cu: SsuCustomer, cfg: SsuSettings): Promise<"reviewed" | "skipped" | "eligible" | "drafted"> {
  const skip = skipReason(cu, cfg);
  const p = await db();
  if (skip) {
    await tx(async (c) => {
      await c.query("update ssu_customers set status = $2, skip_reason = $3, updated_at = now() where store_domain = $1", [cu.store_domain, skip.status, skip.reason]);
      if (cu.status !== skip.status) await logEvent(c, cu.store_domain, skip.status, "system", { reason: skip.reason });
    });
    return skip.status;
  }
  const recent =
    !!cu.last_selected_at && Date.now() - new Date(cu.last_selected_at).getTime() <= cfg.auto_max_age_hours * 3_600_000;
  if (cfg.mode === "off" || (cfg.mode === "auto" && !recent)) {
    if (cu.status !== "eligible") {
      await p.query("update ssu_customers set status = 'eligible', skip_reason = null, updated_at = now() where store_domain = $1", [cu.store_domain]);
    }
    return "eligible";
  }
  const id = await tx((c) => draft(c, cu, "thanks", { auto: cfg.mode === "auto", actor: cfg.mode === "auto" ? "auto" : "system", cfg }));
  if (!id) {
    /* A thanks was written before (and maybe rejected): no second one. */
    await p.query("update ssu_customers set status = 'skipped', skip_reason = coalesce(skip_reason, 'Đã có tin cảm ơn trước đó') where store_domain = $1 and status in ('new', 'eligible')", [cu.store_domain]);
    return "skipped";
  }
  return "drafted";
}

/** AC2 and Crisp for one store, then the decision. Crisp missing stops here. */
export async function check(domain: string, cfg: SsuSettings, actor = "system"): Promise<string> {
  const st = await ac2Store(domain).catch(() => null);
  if (st) await writeAc2(domain, st);
  let cu = await load(domain);
  if (!cu) return "missing";
  if (cu.email) {
    await writeReview(domain, await reviewCheck(cu.email));
    cu = (await load(domain))!;
  }
  const p = await db();
  await logEvent(p, domain, "checked", actor, {
    ac2: !!st,
    crisp_conversations: cu.crisp_conversations,
    app_review: cu.app_review,
  });
  return decide(cu, cfg);
}

async function checkNew(cfg: SsuSettings, out: SsuJobState): Promise<void> {
  const p = await db();
  const { rows } = await p.query<{ store_domain: string }>(
    "select store_domain from ssu_customers where status = 'new' order by last_selected_at desc limit $1",
    [CHECK_BATCH],
  );
  out.checked = 0;
  out.drafted = 0;
  for (const { store_domain } of rows) {
    const r = await check(store_domain, cfg);
    out.checked++;
    if (r === "drafted") out.drafted++;
  }
  /* Eligible customers, when the mode now allows them a message. */
  if (cfg.mode !== "off") {
    const el = await p.query<SsuCustomer>(
      `select * from ssu_customers where status = 'eligible'
          and ($1 = 'manual' or last_selected_at > now() - make_interval(hours => $2))
        order by last_selected_at desc limit 50`,
      [cfg.mode, Math.round(cfg.auto_max_age_hours)],
    );
    for (const cu of el.rows) if ((await decide(cu, cfg)) === "drafted") out.drafted++;
  }
}

/* ---------------------------------------------------------------- 4. send */

async function sendApproved(cfg: SsuSettings, out: SsuJobState): Promise<void> {
  if (cfg.send_paused) return;
  const p = await db();
  /* A send cut off mid-way (a restart) is not retried blind: it may have
     reached the customer. It is failed, with a reason that says check Crisp. */
  await p.query(
    `update ssu_messages set status = 'failed', error = 'Gửi bị gián đoạn — kiểm tra Crisp trước khi gửi lại', failed_at = now(), attempts = attempts + 1
      where status = 'sending' and coalesce(approved_at, created_at) < now() - interval '10 minutes'`,
  );
  const { rows } = await p.query<{ id: string }>(
    "select id from ssu_messages where status = 'approved' and (defer_until is null or defer_until <= now()) order by approved_at limit $1",
    [SEND_BATCH],
  );
  out.sent = 0;
  out.failed = 0;
  for (const { id } of rows) {
    const r = await sendOne(id);
    if (r === "sent") out.sent++;
    else if (r === "failed") out.failed++;
  }
}

/* ---------------------------------------------------------------- 5. track */

const textOf = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" ? JSON.stringify(v) : String(v ?? ""));

export async function trackOne(cu: SsuCustomer, actor = "system"): Promise<void> {
  const sent = cu.sent_at ? new Date(cu.sent_at).getTime() : 0;
  const patch: Record<string, unknown> = {};
  const events: [string, Record<string, unknown>][] = [];

  if (cu.crisp_session) {
    const msgs = await conversationMessages(cu.crisp_session);
    const ours = msgs.filter((m) => m.from === "operator" && m.type === "text" && Number(m.timestamp) >= sent - 60_000);
    if (!cu.delivered_at && ours.some((m) => m.delivered || m.read)) {
      patch.delivered_at = new Date().toISOString();
      events.push(["delivered", {}]);
    }
    if (!cu.read_at && ours.some((m) => m.read)) {
      patch.read_at = new Date().toISOString();
      events.push(["read", {}]);
    }
    const replies = msgs.filter((m) => m.from === "user" && Number(m.timestamp) >= sent);
    if (replies.length) {
      const last = replies[replies.length - 1];
      /* Whole seconds: the database keeps seconds (see upsell/db.ts), Crisp
         milliseconds — compared raw, the same reply would look new each time. */
      const lastSec = Math.floor(Number(last.timestamp) / 1000);
      const lastAt = new Date(lastSec * 1000).toISOString();
      patch.replied = true;
      if (!cu.last_reply_at || lastSec > Math.floor(new Date(cu.last_reply_at).getTime() / 1000)) {
        const text = replies
          .slice(-5)
          .map((m) => textOf(m.content))
          .join("\n")
          .slice(0, 1500);
        Object.assign(patch, { last_reply_at: lastAt, last_reply_text: text, needs_check: true, checked_at: null, checked_by: null });
        events.push(["replied", { text: text.slice(0, 300) }]);
        /* Tagged on Crisp too, so the replies can be followed from there. A
           failure is noted, not fatal: the reply is still on "Cần kiểm tra". */
        const segment = (await getSsuSettings()).reply_segment.trim();
        if (segment) {
          await addSegment(cu.crisp_session, segment).then(
            () => events.push(["segmented", { segment }]),
            (err) => events.push(["segment_failed", { segment, error: err instanceof Error ? err.message : String(err) }]),
          );
        }
      }
    }
  }

  if (cu.email && (!cu.crisp_checked_at || Date.now() - new Date(cu.crisp_checked_at).getTime() > RECHECK_MS)) {
    const r = await reviewCheck(cu.email);
    await writeReview(cu.store_domain, r);
    if (r.app_review !== null && r.app_review >= 5 && !cu.reviewed_at) {
      patch.reviewed_at = new Date().toISOString();
      events.push(["reviewed", { app_review: r.app_review }]);
    }
  }

  if (!cu.ac2_synced_at || Date.now() - new Date(cu.ac2_synced_at).getTime() > RECHECK_MS) {
    const st = await ac2Store(cu.store_domain).catch(() => null);
    if (st) {
      await writeAc2(cu.store_domain, st);
      const f = ac2Fields(st);
      if (!cu.upgraded_at && cu.price_at_send !== null && (f.pf_price ?? 0) > Number(cu.price_at_send)) {
        /* When it happened, from AC2's charge — else when it was noticed (within the hour). */
        const at = await ac2UpgradeTime(cu.store_domain, cu.sent_at);
        const from = cu.plan_at_send ?? (Number(cu.price_at_send) === 0 ? "Free" : `$${cu.price_at_send}`);
        Object.assign(patch, {
          upgraded_at: at ?? new Date().toISOString(),
          upgrade_exact: !!at,
          upgraded_from: from,
          upgraded_to: f.pf_plan,
          upgraded_price: f.pf_price,
        });
        events.push(["upgraded", { from, from_price: cu.price_at_send, to: f.pf_plan, to_price: f.pf_price, at }]);
      }
      const morePages = cu.pages_at_send !== null && (f.pages ?? 0) > Number(cu.pages_at_send);
      const morePublished = cu.published_at_send !== null && (f.published ?? 0) > Number(cu.published_at_send);
      if (!cu.pages_updated_at && (morePages || morePublished)) {
        patch.pages_updated_at = new Date().toISOString();
        events.push(["pages_updated", { pages: f.pages, published: f.published }]);
      }
      if (f.app_status === "uninstalled" && cu.app_status !== "uninstalled") events.push(["uninstalled", {}]);
    }
  }

  /* Upgrades seen before AC2's time was read: looked up once. */
  if (cu.upgraded_at && cu.upgrade_exact === null && !("upgrade_exact" in patch)) {
    const at = await ac2UpgradeTime(cu.store_domain, cu.sent_at);
    Object.assign(patch, at ? { upgraded_at: at, upgrade_exact: true } : { upgrade_exact: false });
  }

  const keys = Object.keys(patch);
  await tx(async (c) => {
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    await c.query(
      `update ssu_customers set ${[...sets, "tracked_at = now()", "updated_at = now()"].join(", ")} where store_domain = $1`,
      [cu.store_domain, ...keys.map((k) => patch[k])],
    );
    for (const [type, detail] of events) await logEvent(c, cu.store_domain, type, actor, detail);
  });
}

async function track(cfg: SsuSettings, out: SsuJobState): Promise<void> {
  const last = await getInternal<string>("tracked");
  if (last && Date.now() - new Date(last).getTime() < TRACK_EVERY_MS) return;
  await setInternal("tracked", new Date().toISOString());
  const p = await db();
  const { rows } = await p.query<SsuCustomer>(
    `select * from ssu_customers
      where (status = 'sent' or review_asked_at is not null)
        and sent_at > now() - make_interval(days => $1)
        and (tracked_at is null or tracked_at < now() - interval '9 minutes')
      order by tracked_at nulls first limit $2`,
    [Math.round(cfg.tracking_days), TRACK_BATCH],
  );
  out.tracked = 0;
  for (const cu of rows) {
    await trackOne(cu);
    out.tracked++;
  }
}

/* ---------------------------------------------------------------- 6. care */

/** The care message due for a customer now, or null. One at a time, in this
    order: a check-in after reading, then the days-left reminder once the
    free editing is nearly over. Never a thanks for upgrading, nor a review
    ask: those are written by hand from the customer's card, if ever. */
export function careDue(cu: SsuCustomer, have: string[], cfg: SsuSettings): CareKind | null {
  const left = daysLeft(cu, cfg);
  if (cu.read_at && Date.now() - new Date(cu.read_at).getTime() >= cfg.care_read_hours * 3_600_000 && left > 0 && !have.includes("care_read"))
    return "care_read";
  /* Not on Crisp's "delivered": it is set the moment a message is emailed to an
     offline customer, so it says nothing about them having seen it. */
  if (cu.sent_at && left > 0 && left <= cfg.edit_reminder_days_left && !have.includes("edit_reminder")) return "edit_reminder";
  return null;
}

async function care(cfg: SsuSettings, out: SsuJobState): Promise<void> {
  out.care = 0;
  if (cfg.care_mode === "off") return;
  const p = await db();
  const { rows } = await p.query<SsuCustomer & { kinds: string[] }>(
    `select c.*, coalesce(array_agg(m.kind) filter (where m.kind is not null), '{}') as kinds
       from ssu_customers c left join ssu_messages m on m.store_domain = c.store_domain
      where c.status = 'sent' and not c.replied and coalesce(c.app_review, 0) < 5
        and coalesce(c.app_status, 'installed') = 'installed'
        and c.sent_at > now() - make_interval(days => $1)
        and not exists (select 1 from ssu_messages x where x.store_domain = c.store_domain and x.status in ('pending_review', 'approved', 'sending'))
        and not exists (select 1 from ssu_messages x where x.store_domain = c.store_domain and x.status = 'sent'
                          and x.sent_at > now() - make_interval(hours => $2))
      group by c.store_domain order by c.sent_at limit 50`,
    [Math.round(cfg.tracking_days), Math.round(cfg.care_gap_hours)],
  );
  const auto = cfg.care_mode === "auto";
  for (const cu of rows) {
    const kind = careDue(cu, cu.kinds, cfg);
    if (!kind) continue;
    const id = await tx((c) => draft(c, cu, kind, { auto, actor: auto ? "auto" : "system", cfg }));
    if (id) out.care++;
  }
}

/* ---------------------------------------------------------------- 7. refresh */

async function refreshStores(): Promise<void> {
  const p = await db();
  const { rows } = await p.query<{ store_domain: string }>(
    `select store_domain from ssu_customers
      where status <> 'new' and (ac2_synced_at is null or ac2_synced_at < now() - interval '24 hours')
      order by ac2_synced_at nulls first limit 20`,
  );
  for (const { store_domain } of rows) {
    const st = await ac2Store(store_domain).catch(() => null);
    if (st) await writeAc2(store_domain, st);
  }
}

/* ---------------------------------------------------------------- the run */

let running: Promise<SsuJobState> | null = null;

/* ---------------------------------------------------------------- by hand */

export type AddResult = {
  domain: string;
  selections: number;
  /** what became of them: drafted (waiting on Chờ duyệt), reviewed, skipped, eligible, or already handled */
  result: "drafted" | "reviewed" | "skipped" | "eligible" | "exists";
  status: string;
  skip_reason: string | null;
};

const ADD_DAYS = 90;

/**
 * One store added by hand — a customer from before the backfill, say. Its
 * own selects (last 90 days) are read from Mixpanel, so the pages and sets
 * are the real ones, then it is checked like a new store: AC2, every Crisp
 * conversation for the 5★ rule. A thanks is only ever DRAFTED here, for
 * approval, whatever the mode — the select may be weeks old.
 */
export async function addStore(input: string, actor: string): Promise<AddResult> {
  const domain = domainOf(input);
  if (!domain || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain))
    throw new UpsellError("Nhập Shopify domain dạng abc-123.myshopify.com.", 422);
  const existing = await load(domain);
  if (existing && existing.status !== "new" && existing.status !== "eligible") {
    return { domain, selections: existing.selections, result: "exists", status: existing.status, skip_reason: existing.skip_reason };
  }
  let events: MixpanelEvent[];
  try {
    events = (await exportStoreSetSelects(new Date(Date.now() - ADD_DAYS * 86_400_000), domain)).filter(
      (e) => domainOf(e.properties?.shopify_domain) === domain,
    );
  } catch (err) {
    if (err instanceof MixpanelBusy) throw new UpsellError("Mixpanel đang giới hạn 60 lần đọc/giờ — thử lại sau vài phút.", 429);
    throw new UpsellError(err instanceof Error ? err.message : String(err), 502);
  }
  if (events.length === 0 && !existing)
    throw new UpsellError(`Mixpanel không có lượt Select Store set nào của ${domain} trong ${ADD_DAYS} ngày qua.`, 404);
  await ingest(events);
  const cfg = await getSsuSettings();
  await loadSetNames();
  await logEvent(await db(), domain, "added", actor, { selections: events.length });
  const result = (await check(domain, { ...cfg, mode: "manual" }, actor)) as AddResult["result"];
  const cu = (await load(domain))!;
  return { domain, selections: cu.selections, result, status: cu.status, skip_reason: cu.skip_reason };
}

export function runJob(): Promise<SsuJobState> {
  if (!running) running = runOnce().finally(() => (running = null));
  return running;
}

async function runOnce(): Promise<SsuJobState> {
  const out: SsuJobState = { at: new Date().toISOString(), errors: [] };
  const cfg = await getSsuSettings();
  await loadSetNames();
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof ConfigMissing ? err.message : `${name}: ${err instanceof Error ? err.message : String(err)}`;
      out.errors!.push(msg);
      if (!(err instanceof ConfigMissing)) console.error("[store-set-upsell]", name, err);
    }
  };
  await step("Mixpanel", () => read(cfg, out));
  await step("Kiểm tra khách", () => checkNew(cfg, out));
  /* Track and care before send: a care message in auto mode goes out in
     the same minute it is written. */
  await step("Theo dõi", () => track(cfg, out));
  await step("Chăm sóc", () => care(cfg, out));
  await step("Gửi tin", () => sendApproved(cfg, out));
  await step("AC2", () => refreshStores());
  out.errors = [...new Set(out.errors)];
  await setInternal("job", out).catch(() => undefined);
  return out;
}

const TICK_MS = 60_000;
let started = false;

/** Every minute, from instrumentation.ts. Postgres only; off with SSU_DISABLE_TIMER=1. */
export function startStoreSetTimer(): void {
  if (started || !hasStoreSetDatabase() || process.env.SSU_DISABLE_TIMER === "1") return;
  started = true;
  const run = () =>
    runJob().then(
      (r) => {
        if (r.new_selections || r.sent || r.failed || r.drafted || r.care) console.log("[store-set-upsell]", JSON.stringify(r));
      },
      (err) => console.error("[store-set-upsell] run failed", err),
    );
  setTimeout(run, 45_000).unref?.();
  setInterval(run, TICK_MS).unref?.();
}
