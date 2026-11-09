import "server-only";

import {
  ConfigMissing,
  ac2Store,
  ac2Stores,
  ac2UpgradeTime,
  addSegment,
  conversationMessages,
  crispSender,
  resolveConversation,
  reviewCheck,
  sendInConversation,
  sendInNewConversation,
  sendNote,
  ticketLink,
  type Ac2Store,
} from "@/lib/storeSetUpsell/clients";
import { connection } from "@/lib/storeSetUpsell/settings";
import { readSheetValues } from "@/lib/sheet";
import { sessionOf, sheetTime } from "@/lib/ucp2/core";
import { UpsellError } from "@/lib/upsell/types";
import { classifyCategories, readReply } from "./ai";
import { db, getState, hasUrspDatabase, logEvent, setState, tx } from "./db";
import { campaignOver, getUrspSettings, runState, type UrspSettings } from "./settings";
import { SEGMENTS, SKIP_REASONS, type Segment, type SkipCode, type UrspTarget } from "./types";

/* ==========================================================================
   Upsell Responsive: who gets Logan's offer, the offer, and what came of it.

     recap    new rows of the support Recap sheet ("Recap v11"): a ticket
              whose category_issue Haiku calls responsive, and whose
              resolution is not one of the skipped ones → the offer, in that
              same ticket. Read every 5 minutes, from where the last read
              ended — rows written before Bắt đầu are never read. Straight
              from Google (SHEET_SERVICE_ACCOUNT_JSON, sheet shared with it)
              or posted in by n8n (POST /api/ursp/recap).
     active   once an hour, AC2's store list: stores active today (Vietnam
              time) with no Crisp conversation lately → the offer, in their
              last conversation if they have an older one, else a new one
              (which reaches them by email).

   Both: a paying Shopify plan, no more than max_published_pages published,
   installed, and one message per store whatever the segment. Every store
   looked at is kept — sent, or skipped with the reason — so the screen can
   say how many were found, how many left out and why.

   After it goes: read / reply from Crisp (a reply puts a note on the ticket
   mentioning Logan, and Haiku reads what they want and how they feel), and a
   few times a day the plan (AC2) and app_review (Crisp) — so it shows
   whether a store upgraded or reviewed after the team handled it.

   Nothing runs while the screen says Tạm dừng.
   ========================================================================== */

const RECAP_SHEET_ID = process.env.URSP_RECAP_SHEET_ID ?? "164dn2Er7xjcwOtudVts7fahT8iiIoV6bNX8HHyx5pEg";
const RECAP_TAB = process.env.URSP_RECAP_TAB ?? "Recap v11";
export const RECAP_SHEET_URL = `https://docs.google.com/spreadsheets/d/${RECAP_SHEET_ID}/edit`;
const RECAP_EVERY_MS = 5 * 60_000;
const ACTIVE_EVERY_MS = 60 * 60_000;
const CRISP_EVERY_MS = 15 * 60_000;
const SLOW_EVERY_MS = 6 * 60 * 60_000;
const TRACK_BATCH = 25;
const RECAP_BATCH = 500;

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const domainOf = (v: unknown): string | null =>
  str(v)
    ?.toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "") || null;
const intOf = (v: unknown): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && s.replace(/[^\d]/g, "") !== "" ? Math.round(n) : null;
};
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/* ---------------------------------------------------------------- message */

/* Crisp renders *bold* in chat and in the email it sends. Built to be
   answered: who we are, why now (BFCM shoppers are on their phones), what
   they get (ALL pages, FREE, nothing to do), until when, and one easy reply. */
const OFFER = `For a limited time, our experts will:
✅ *Review the responsive layout of ALL your PageFly pages* — mobile, tablet and desktop
✅ *Fix every issue we find, 100% FREE* — no work needed on your side

Most of your *BLACK FRIDAY* shoppers will browse and buy *on their phones*, so a page that breaks on mobile can quietly cost you sales.

⏰ This free service is only available until *{end_date}*.

👉 *Just reply "YES" to this message* and we will get started right away.

Best regards,
{pic} – PageFly Technical Team`;

const DEFAULT_TEMPLATES: Record<Segment, string> = {
  recap: `Hi {store_name} team,

This is {pic} from the *PageFly Technical Team* 👋

You recently reached out to us about how your pages look on mobile. Before the *BLACK FRIDAY – CYBER MONDAY* rush, we would love to make sure *EVERY page* of your store looks perfect on every screen.

${OFFER}`,
  active: `Hi {store_name} team,

This is {pic} from the *PageFly Technical Team* 👋

*BLACK FRIDAY – CYBER MONDAY* is the busiest week of the year — let's make sure *EVERY page* of your store looks perfect on every screen before your visitors arrive.

${OFFER}`,
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11-30" → "November 30" */
export function endDateText(ymd: string): string {
  const m = ymd.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}` : ymd;
}

export function composeMessage(segment: Segment, t: { store_name: string | null; store_domain: string }, cfg: UrspSettings): string {
  const tpl = (segment === "recap" ? cfg.recap_template : cfg.active_template).trim() || DEFAULT_TEMPLATES[segment];
  const name = t.store_name?.trim() || t.store_domain.replace(/\.myshopify\.com$/, "");
  return tpl
    .replaceAll("{store_name}", name)
    .replaceAll("{pic}", cfg.sender_name)
    .replaceAll("{end_date}", endDateText(cfg.campaign_end));
}

/* ---------------------------------------------------------------- rules */

/** A Shopify plan that is not a paying store: development, partner, staff, trial, closed… */
export function shopifyUnpaid(plan: string | null | undefined): boolean {
  const p = (plan ?? "").trim();
  if (!p) return true;
  return /dev|partner|staff|affiliate|trial|sandbox|test|frozen|paus|dormant|cancel|fraud|closed|alumni|learning|unknown|^n\/?a$/i.test(p);
}

export function resolutionSkipped(resolution: string | null, cfg: UrspSettings): boolean {
  if (!resolution) return false;
  const r = fold(resolution);
  return cfg.recap_skip_resolutions
    .split(",")
    .map(fold)
    .filter(Boolean)
    .some((x) => r === x);
}

type Facts = {
  email: string | null;
  store_name: string | null;
  country: string | null;
  shopify_plan: string | null;
  pf_plan: string | null;
  pf_price: number | null;
  pages_published: number | null;
  status: string | null;
};

function factsOf(st: (Ac2Store & Record<string, unknown>) | null, fallback: Partial<Facts> = {}): Facts {
  return {
    email: str(st?.email)?.toLowerCase() ?? fallback.email ?? null,
    store_name: str(st?.name) ?? fallback.store_name ?? null,
    country: str(st?.country) ?? fallback.country ?? null,
    shopify_plan: str(st?.shopifyPlan) ?? fallback.shopify_plan ?? null,
    pf_plan: str(st?.pageflyPlan) ?? fallback.pf_plan ?? null,
    pf_price: st?.pageflyPrice !== undefined && st?.pageflyPrice !== null ? Number(st.pageflyPrice) || 0 : (fallback.pf_price ?? null),
    pages_published: intOf(st?.numPublished) ?? fallback.pages_published ?? null,
    status: str(st?.status) ?? fallback.status ?? null,
  };
}

/** The store rules both segments share; null when the store qualifies. */
function storeRule(f: Facts, found: boolean, cfg: UrspSettings): { code: SkipCode; reason: string } | null {
  if (!found) return { code: "no_ac2", reason: SKIP_REASONS.no_ac2 };
  if (f.status === "uninstalled") return { code: "uninstalled", reason: SKIP_REASONS.uninstalled };
  if (shopifyUnpaid(f.shopify_plan)) return { code: "shopify_unpaid", reason: `${SKIP_REASONS.shopify_unpaid}: ${f.shopify_plan || "không rõ"}` };
  if (f.pages_published !== null && f.pages_published > cfg.max_published_pages)
    return { code: "too_many_pages", reason: `${f.pages_published} page publish (tối đa ${cfg.max_published_pages})` };
  return null;
}

/* ---------------------------------------------------------------- targets */

type NewTarget = {
  segment: Segment;
  store_domain: string;
  recap_key?: string | null;
  session_id?: string | null;
  ticket_link?: string | null;
  source: Record<string, unknown>;
  facts: Partial<Facts>;
  /** a rule the segment broke before the store was looked up */
  skip?: { code: SkipCode; reason: string } | null;
};

/** Skipped for a reason that can change: the store is looked at again when it comes up again. */
const RECONSIDER: SkipCode[] = ["resolution", "no_ac2", "uninstalled", "shopify_unpaid", "too_many_pages", "no_email", "contacted", "no_ticket"];

/**
 * Looks a store up and keeps it: skipped with the reason, or with the
 * message — pending (manual) or approved (auto). Returns the id, or null
 * when the store already has a target there is no reason to touch.
 */
async function addTarget(n: NewTarget, cfg: UrspSettings, actor: string): Promise<{ id: string; status: string } | null> {
  const p = await db();
  const { rows: have } = await p.query<Pick<UrspTarget, "id" | "segment" | "status" | "skip_code">>(
    "select id, segment, status, skip_code from ursp_targets where store_domain = $1",
    [n.store_domain],
  );
  const same = have.find((h) => h.segment === n.segment);
  if (same && !(same.status === "skipped" && RECONSIDER.includes(same.skip_code as SkipCode))) return null;
  const other = have.find((h) => h.segment !== n.segment && h.status !== "skipped");

  let skip = n.skip ?? null;
  let facts: Facts = factsOf(null, n.facts);
  let firstAc2 = false;
  if (!skip && other) skip = { code: "other_segment", reason: `${SKIP_REASONS.other_segment} (${SEGMENTS[other.segment].label})` };
  if (!skip && campaignOver(cfg)) skip = { code: "ended", reason: SKIP_REASONS.ended };
  if (!skip) {
    const st = (await ac2Store(n.store_domain).catch(() => null)) as (Ac2Store & Record<string, unknown>) | null;
    facts = factsOf(st, n.facts);
    firstAc2 = !!st;
    skip = storeRule(facts, !!st, cfg);
  }
  let session_id = n.session_id ?? null;
  let ticket_link = n.ticket_link ?? null;
  if (!skip && n.segment === "active") {
    if (!facts.email) skip = { code: "no_email", reason: SKIP_REASONS.no_email };
    else {
      const days = cfg.active_no_contact_days;
      const r = await reviewCheck(facts.email);
      const since = days > 0 ? Date.now() - days * 86_400_000 : -Infinity;
      const recent = r.conversations.find((c) => !c.updated_at || new Date(c.updated_at).getTime() >= since);
      if (recent)
        skip = {
          code: "contacted",
          reason: `${SKIP_REASONS.contacted}${days > 0 ? ` trong ${days} ngày` : ""}${recent.updated_at ? ` (${recent.updated_at.slice(0, 10)})` : ""}`,
        };
      /* an older conversation is where the message goes; none: a new one is opened when it is sent */
      else if (r.conversations[0]) {
        session_id = r.conversations[0].session_id;
        ticket_link = r.conversations[0].link;
      }
    }
  }

  const status = skip ? "skipped" : cfg.mode === "auto" ? "approved" : "pending";
  const message = skip ? null : composeMessage(n.segment, { store_name: facts.store_name, store_domain: n.store_domain }, cfg);
  return tx(async (c) => {
    const vals = [
      n.segment,
      n.store_domain,
      n.recap_key ?? null,
      facts.email,
      facts.store_name,
      facts.country,
      facts.shopify_plan,
      facts.pf_plan,
      facts.pf_price,
      facts.pages_published,
      session_id,
      ticket_link,
      JSON.stringify(n.source),
      status,
      skip?.code ?? null,
      skip?.reason ?? null,
      message,
      status === "approved" ? "auto" : null,
      firstAc2 ? facts.pf_price : null,
    ];
    const { rows } = await c.query<{ id: string }>(
      `insert into ursp_targets (segment, store_domain, recap_key, email, store_name, country, shopify_plan, pf_plan, pf_price, pages_published,
                                 session_id, ticket_link, source, status, skip_code, skip_reason, message, approved_by, first_price, first_ac2_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, case when $19::numeric is null then null else now() end)
       on conflict (segment, store_domain) do update set
         recap_key = excluded.recap_key, email = excluded.email, store_name = excluded.store_name, country = excluded.country,
         shopify_plan = excluded.shopify_plan, pf_plan = excluded.pf_plan, pf_price = excluded.pf_price, pages_published = excluded.pages_published,
         session_id = excluded.session_id, ticket_link = excluded.ticket_link, source = excluded.source, status = excluded.status,
         skip_code = excluded.skip_code, skip_reason = excluded.skip_reason, message = excluded.message, approved_by = excluded.approved_by,
         first_price = excluded.first_price, first_ac2_at = excluded.first_ac2_at, updated_at = now()
       where ursp_targets.status = 'skipped'
       returning id`,
      vals,
    );
    if (!rows[0]) return null;
    await logEvent(c, rows[0].id, skip ? "skipped" : "found", actor, skip ? { code: skip.code, reason: skip.reason } : { status });
    return { id: rows[0].id, status };
  });
}

/* ---------------------------------------------------------------- recap */

export type RecapIn = {
  sheet_row: number | null;
  recap_at: string | null;
  store_domain: string | null;
  session_id: string | null;
  ticket_url: string | null;
  category_issue: string | null;
  resolution: string | null;
  issue_summary: string | null;
  pic: string | null;
  shopify_plan: string | null;
  pages_published: number | null;
  store_name: string | null;
  country: string | null;
};

/** A field by any of its names, exact first, then ignoring case. */
function pick(r: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) if (r[n] !== undefined && r[n] !== "") return r[n];
  const lower = new Map(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v]));
  for (const n of names) {
    const v = lower.get(n.toLowerCase());
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

/** One Recap row, from the sheet's headers (as n8n's Google Sheets node gives them, or our own read). */
export function recapRow(r: Record<string, unknown>, sheetRow: number | null = null): RecapIn {
  const ticket = str(pick(r, "ticket_url", "Ticket"));
  return {
    sheet_row: sheetRow ?? (Number(pick(r, "row_number", "row")) || null),
    recap_at: sheetTime(pick(r, "recap_at_vn", "recap_at")),
    store_domain: domainOf(pick(r, "store_domain", "Store Domain")),
    session_id: sessionOf(pick(r, "session_id")) ?? sessionOf(ticket),
    ticket_url: ticket,
    category_issue: str(pick(r, "category_issue")),
    resolution: str(pick(r, "resolution")),
    issue_summary: str(pick(r, "issue_summary")),
    pic: str(pick(r, "name_pic", "shift_lead")),
    shopify_plan: str(pick(r, "shopify_plan")),
    pages_published: intOf(pick(r, "num_pages_publish")),
    store_name: str(pick(r, "store_name")),
    country: str(pick(r, "country")),
  };
}

export type RecapResult = { at: string; source: "sheet" | "n8n"; read: number; added: number; responsive: number; targets: number; cursor?: number; note?: string };

/**
 * New Recap rows in: kept, their categories put to Haiku (once per spelling),
 * and each responsive one looked at as a target.
 */
export async function ingestRecap(rows: RecapIn[], source: RecapResult["source"], actor: string): Promise<RecapResult> {
  const out: RecapResult = { at: new Date().toISOString(), source, read: rows.length, added: 0, responsive: 0, targets: 0 };
  const cfg = await getUrspSettings();
  const p = await db();
  const fresh: (RecapIn & { key: string })[] = [];
  for (const r of rows) {
    if (!r.recap_at && !r.session_id && !r.store_domain) continue;
    const key = r.session_id ? `${r.session_id}|${r.recap_at ?? ""}` : `row:${r.sheet_row ?? `${r.store_domain}|${r.recap_at}`}`;
    const ins = await p.query(
      `insert into ursp_recap_rows (row_key, sheet_row, recap_at, store_domain, session_id, ticket_url, category_issue, resolution, issue_summary, pic, shopify_plan, pages_published)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (row_key) do nothing`,
      [key, r.sheet_row, r.recap_at, r.store_domain, r.session_id, r.ticket_url, r.category_issue, r.resolution, r.issue_summary, r.pic, r.shopify_plan, r.pages_published],
    );
    if (ins.rowCount) fresh.push({ ...r, key });
  }
  out.added = fresh.length;
  if (!fresh.length) return out;

  /* Haiku, once per spelling never seen before */
  const values = [...new Set(fresh.map((r) => r.category_issue).filter((v): v is string => !!v))];
  const known = new Map(
    (await p.query<{ category: string; responsive: boolean }>("select category, responsive from ursp_categories where category = any($1)", [values])).rows.map((r) => [
      r.category,
      r.responsive,
    ]),
  );
  for (const c of await classifyCategories(values.filter((v) => !known.has(v)))) {
    known.set(c.value, c.responsive);
    await p.query("insert into ursp_categories (category, responsive, by) values ($1, $2, $3) on conflict (category) do nothing", [c.value, c.responsive, c.by]);
  }

  for (const r of fresh) {
    const responsive = r.category_issue ? (known.get(r.category_issue) ?? false) : false;
    await p.query("update ursp_recap_rows set responsive = $2 where row_key = $1", [r.key, responsive]);
    if (!responsive) continue;
    out.responsive++;
    const skip: NewTarget["skip"] = resolutionSkipped(r.resolution, cfg)
      ? { code: "resolution", reason: `Resolution: ${r.resolution}` }
      : !r.store_domain
        ? { code: "no_domain", reason: SKIP_REASONS.no_domain }
        : !r.session_id
          ? { code: "no_ticket", reason: SKIP_REASONS.no_ticket }
          : null;
    const wid = await connection("crisp_website_id");
    const t = await addTarget(
      {
        segment: "recap",
        store_domain: r.store_domain ?? `(không domain) ${r.session_id ?? r.key}`,
        recap_key: r.key,
        session_id: r.session_id,
        ticket_link: r.session_id ? ticketLink(wid, r.session_id) : r.ticket_url,
        source: {
          recap_at: r.recap_at,
          sheet_row: r.sheet_row,
          category_issue: r.category_issue,
          resolution: r.resolution,
          issue_summary: r.issue_summary,
          pic: r.pic,
        },
        facts: { shopify_plan: r.shopify_plan, pages_published: r.pages_published, store_name: r.store_name, country: r.country },
        skip,
      },
      cfg,
      actor,
    ).catch((err) => {
      if (err instanceof ConfigMissing) throw err;
      console.error("[ursp] recap target", r.store_domain, errText(err));
      return null;
    });
    if (t) {
      out.targets++;
      await p.query("update ursp_recap_rows set target_id = $2 where row_key = $1", [r.key, t.id]);
    }
  }
  return out;
}

/** Rows posted by n8n: only those written since Bắt đầu. */
export async function importRecap(input: unknown, actor = "n8n"): Promise<RecapResult> {
  const list = Array.isArray(input) ? input : input && typeof input === "object" && Array.isArray((input as { rows?: unknown }).rows) ? (input as { rows: unknown[] }).rows : null;
  if (!list) throw new UpsellError('Gửi một mảng row, hoặc {"rows": [...]}.', 422);
  if (list.length > 5000) throw new UpsellError("Tối đa 5000 row một lần.", 422);
  const run = await runState();
  if (!run.on || !run.started_at) return { at: new Date().toISOString(), source: "n8n", read: list.length, added: 0, responsive: 0, targets: 0, note: "Đang tạm dừng — bỏ qua" };
  const from = new Date(run.started_at).getTime() - 5 * 60_000;
  const rows = list
    .map((raw) => recapRow(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}))
    .filter((r) => r.recap_at && new Date(r.recap_at).getTime() >= from);
  const out = await ingestRecap(rows, "n8n", actor);
  await setState("recap", out);
  return out;
}

/**
 * The sheet itself, from the row after the last one read. The first read
 * after Bắt đầu only finds where the sheet ends: what is above it is old.
 */
async function readRecapSheet(): Promise<RecapResult | null> {
  if (!process.env.SHEET_SERVICE_ACCOUNT_JSON) return null;
  const cursor = await getState<{ row: number; header: string[] }>("recap_cursor");
  if (!cursor) {
    const [col, head] = await Promise.all([readSheetValues(RECAP_SHEET_ID, `${RECAP_TAB}!A:A`), readSheetValues(RECAP_SHEET_ID, `${RECAP_TAB}!1:1`)]);
    const row = col.length;
    await setState("recap_cursor", { row, header: head[0] ?? [] });
    return { at: new Date().toISOString(), source: "sheet", read: 0, added: 0, responsive: 0, targets: 0, cursor: row, note: `Bắt đầu từ sau dòng ${row}` };
  }
  const values = await readSheetValues(RECAP_SHEET_ID, `${RECAP_TAB}!A${cursor.row + 1}:BH${cursor.row + RECAP_BATCH}`);
  /* the last row with anything in it: a row half written is read next time */
  let last = values.length;
  while (last > 0 && !(values[last - 1] ?? []).some((c) => String(c ?? "").trim())) last--;
  const rows = values.slice(0, last).map((cells, i) => recapRow(Object.fromEntries(cursor.header.map((h, j) => [h, cells[j] ?? ""])), cursor.row + 1 + i));
  const out = await ingestRecap(rows, "sheet", "system");
  await setState("recap_cursor", { ...cursor, row: cursor.row + last });
  return { ...out, cursor: cursor.row + last };
}

/* ---------------------------------------------------------------- active */

export type ActiveResult = {
  at: string;
  listed: number;
  active_today: number;
  looked: number;
  targets: number;
  field: string | null;
  /** the fields AC2's list items carry — to set active_fields when none matches */
  keys: string[];
  error?: string;
};

const vnDay = (t: number) => new Date(t + 7 * 3_600_000).toISOString().slice(0, 10);

/** When AC2 says the store was last active, by the first of `fields` it has. */
export function activeAt(item: Record<string, unknown>, fields: string[]): { at: number; field: string } | null {
  for (const f of fields) {
    const v = item[f];
    if (v === undefined || v === null || v === "") continue;
    const t = typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v));
    if (Number.isFinite(t)) return { at: t, field: f };
  }
  return null;
}

async function scanActive(cfg: UrspSettings): Promise<ActiveResult> {
  const out: ActiveResult = { at: new Date().toISOString(), listed: 0, active_today: 0, looked: 0, targets: 0, field: null, keys: [] };
  const items = await ac2Stores(cfg.active_ac2_query);
  if (!items) return { ...out, error: "AC2 không trả danh sách store (chưa cấu hình n8n AC2, hoặc lỗi)" };
  out.listed = items.length;
  out.keys = Object.keys(items[0] ?? {}).slice(0, 60);
  const fields = cfg.active_fields
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const today = vnDay(Date.now());
  const active = items.flatMap((it) => {
    const a = activeAt(it, fields);
    const d = domainOf(it.shopDomain);
    if (!a || !d || vnDay(a.at) !== today) return [];
    out.field ??= a.field;
    return [{ it, d, at: a.at, field: a.field }];
  });
  out.active_today = active.length;
  if (!active.length) return out;
  const { rows } = await (await db()).query<{ d: string }>("select distinct store_domain as d from ursp_targets where store_domain = any($1)", [active.map((a) => a.d)]);
  const have = new Set(rows.map((r) => r.d));
  for (const a of active.filter((x) => !have.has(x.d)).slice(0, cfg.active_per_scan)) {
    out.looked++;
    try {
      const t = await addTarget(
        { segment: "active", store_domain: a.d, source: { active_at: new Date(a.at).toISOString(), field: a.field }, facts: factsOf(a.it) },
        cfg,
        "system",
      );
      if (t) out.targets++;
    } catch (err) {
      if (err instanceof ConfigMissing) throw err;
      out.error = errText(err);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- send */

const noteText = (t: Pick<UrspTarget, "segment">, cfg: UrspSettings) =>
  `[Upsell Responsive · ${SEGMENTS[t.segment].label}] ${cfg.sender_name} đã gửi lời mời review responsive + chỉnh sửa miễn phí mọi page (BFMC, tới ${cfg.campaign_end}). ` +
  `Khách reply → mention ${cfg.sender_name} để xử lý.`;

async function sendOne(t: UrspTarget, cfg: UrspSettings, actor: string): Promise<void> {
  const p = await db();
  if (campaignOver(cfg)) {
    await p.query("update ursp_targets set status = 'skipped', skip_code = 'ended', skip_reason = $2, updated_at = now() where id = $1", [t.id, SKIP_REASONS.ended]);
    return;
  }
  const text = t.message?.trim() || composeMessage(t.segment, t, cfg);
  const sender = await crispSender(cfg.sender_name, "");
  try {
    let sid = t.session_id;
    let link = t.ticket_link;
    /* Recap: the support ticket itself. Active: the customer's last
       conversation, when they have one — else a new one, below. */
    if (sid) {
      /* support may be mid-chat there: wait for it to go quiet */
      const msgs = await conversationMessages(sid);
      const lastAt = Math.max(0, ...msgs.map((m) => Number(m.timestamp) || 0));
      if (cfg.quiet_minutes > 0 && Date.now() - lastAt < cfg.quiet_minutes * 60_000) {
        await p.query("update ursp_targets set status = 'approved', wait_until = $2, updated_at = now() where id = $1", [
          t.id,
          new Date(lastAt + cfg.quiet_minutes * 60_000).toISOString(),
        ]);
        return;
      }
      await sendInConversation(sid, text, sender);
      await sendNote(sid, noteText(t, cfg)).catch(() => undefined);
      await resolveConversation(sid).catch(() => undefined);
    } else if (t.segment === "recap") {
      throw new Error("Không có session Crisp");
    } else {
      if (!t.email) throw new Error("Không có email");
      const r = await sendInNewConversation({
        email: t.email,
        nickname: t.store_name || t.store_domain,
        subject: cfg.active_subject,
        content: text,
        sender,
        note: noteText(t, cfg),
      });
      sid = r.session_id;
      link = r.ticket_link;
    }
    if (cfg.crisp_segment.trim()) await addSegment(sid, cfg.crisp_segment.trim()).catch(() => undefined);
    await tx(async (c) => {
      await c.query(
        `update ursp_targets set status = 'sent', sent_at = now(), sent_by = $2, message = $3, session_id = $4, ticket_link = $5,
                error = null, wait_until = null, tracked_at = null, updated_at = now() where id = $1`,
        [t.id, actor, text, sid, link],
      );
      await logEvent(c, t.id, "sent", actor, { session_id: sid });
    });
  } catch (err) {
    if (err instanceof ConfigMissing) {
      await p.query("update ursp_targets set status = 'approved', updated_at = now() where id = $1", [t.id]);
      throw err;
    }
    await tx(async (c) => {
      await c.query("update ursp_targets set status = 'failed', error = $2, updated_at = now() where id = $1", [t.id, errText(err).slice(0, 500)]);
      await logEvent(c, t.id, "send_failed", actor, { error: errText(err).slice(0, 300) });
    });
  }
}

/** Approved messages whose time has come, a few at a time; each claimed so two runs never send one twice. */
async function sendDue(cfg: UrspSettings): Promise<{ sent: number; errors: string[] }> {
  const p = await db();
  const { rows } = await p.query<UrspTarget>(
    `update ursp_targets set status = 'sending', updated_at = now()
      where id in (select id from ursp_targets where status = 'approved' and (wait_until is null or wait_until <= now())
                    order by created_at limit 10 for update skip locked)
      returning *`,
  );
  const out = { sent: 0, errors: [] as string[] };
  for (const t of rows) {
    try {
      await sendOne(t, cfg, t.approved_by ?? "system");
      out.sent++;
    } catch (err) {
      out.errors.push(errText(err));
      if (err instanceof ConfigMissing) break;
    }
  }
  /* claimed and left by a crash: back to the queue after 15 minutes */
  await p.query("update ursp_targets set status = 'approved' where status = 'sending' and updated_at < now() - interval '15 minutes'");
  return out;
}

/* ---------------------------------------------------------------- track */

const textOf = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" ? JSON.stringify(v) : String(v ?? ""));
const age = (t: string | null) => (t ? Date.now() - new Date(t).getTime() : Infinity);

export async function trackOne(t: UrspTarget, cfg: UrspSettings, opts: { force?: boolean; actor?: string } = {}): Promise<void> {
  const actor = opts.actor ?? "system";
  if (!t.sent_at || !t.session_id) return;
  const sent = new Date(t.sent_at).getTime();
  const patch: Record<string, unknown> = {};
  const events: [string, Record<string, unknown>][] = [];
  const errors: string[] = [];

  if (opts.force || age(t.crisp_checked_at) > CRISP_EVERY_MS) {
    try {
      const msgs = await conversationMessages(t.session_id);
      const ours = msgs.filter((m) => m.from === "operator" && m.type === "text" && Number(m.timestamp) >= sent - 10 * 60_000);
      if (!t.delivered_at && ours.some((m) => m.delivered || m.read)) {
        patch.delivered_at = new Date().toISOString();
        events.push(["delivered", {}]);
      }
      if (!t.read_at && ours.some((m) => m.read)) {
        patch.read_at = new Date().toISOString();
        events.push(["read", {}]);
      }
      const replies = msgs.filter((m) => m.from === "user" && Number(m.timestamp) >= sent);
      if (replies.length) {
        const lastSec = Math.floor(Number(replies[replies.length - 1].timestamp) / 1000);
        if (!t.replied_at) patch.replied_at = new Date(Math.floor(Number(replies[0].timestamp) / 1000) * 1000).toISOString();
        if (replies.length !== t.replies) patch.replies = replies.length;
        if (!t.last_reply_at || lastSec > Math.floor(new Date(t.last_reply_at).getTime() / 1000)) {
          const text = replies
            .slice(-5)
            .map((m) => textOf(m.content))
            .join("\n")
            .slice(0, 1500);
          Object.assign(patch, { last_reply_at: new Date(lastSec * 1000).toISOString(), last_reply_text: text });
          events.push(["replied", { text: text.slice(0, 300) }]);
          const read = await readReply(t.message ?? "", text);
          Object.assign(patch, { reply_intent: read.intent, mood: read.mood, mood_note: read.note || null, classified_at: new Date().toISOString() });
          events.push(["classified", { intent: read.intent, mood: read.mood, by: read.by }]);
          /* the first reply: Logan is called in, once */
          if (!t.mentioned_at) {
            const who = await crispSender(cfg.sender_name, "");
            await sendNote(
              t.session_id,
              `[Upsell Responsive] Khách đã reply lời mời review responsive: "${text.slice(0, 300)}" — @${cfg.sender_name} xử lý giúp.`,
              who.user_id ? [who.user_id] : [],
            );
            patch.mentioned_at = new Date().toISOString();
            events.push(["mentioned", { pic: cfg.sender_name, user_id: who.user_id ?? null }]);
          }
        }
      }
      patch.crisp_checked_at = new Date().toISOString();
    } catch (err) {
      if (err instanceof ConfigMissing) throw err;
      errors.push(`Crisp: ${errText(err)}`);
    }
  }

  if (opts.force || age(t.slow_checked_at) > SLOW_EVERY_MS) {
    const st = await ac2Store(t.store_domain).catch(() => null);
    if (st) {
      const price = Number(st.pageflyPrice ?? 0) || 0;
      const plan = str(st.pageflyPlan) ?? "Free";
      Object.assign(patch, { pf_plan: plan, pf_price: price });
      if (t.first_price === null) Object.assign(patch, { first_price: price, first_ac2_at: new Date().toISOString() });
      /* an upgrade is a paid plan AC2 activated after the message — or, when
         AC2 gives no time, a store it saw on Free when the message went */
      if (!t.upgraded_at && price > 0) {
        const at = await ac2UpgradeTime(t.store_domain, t.sent_at).catch(() => null);
        const wasFree = t.first_price !== null && Number(t.first_price) === 0 && t.first_ac2_at !== null && new Date(t.first_ac2_at).getTime() - sent < 24 * 3_600_000;
        if (at || wasFree) {
          Object.assign(patch, { upgraded_at: at ?? new Date().toISOString(), upgraded_to: plan, upgraded_price: price });
          events.push(["upgraded", { to: plan, price, at }]);
        }
      }
      if (!t.uninstalled_at && str(st.status) === "uninstalled") {
        patch.uninstalled_at = str(st.uninstalledAt) ?? new Date().toISOString();
        events.push(["uninstalled", {}]);
      }
    }
    if (t.email && !t.reviewed_at) {
      try {
        const r = await reviewCheck(t.email);
        if (r.app_review !== null && r.app_review !== t.app_review) patch.app_review = r.app_review;
        /* the first look is the baseline: a 5★ already there is not ours */
        if (t.first_review === null && t.slow_checked_at === null) patch.first_review = r.app_review ?? 0;
        else if (r.app_review !== null && r.app_review >= 5 && (t.first_review ?? 0) < 5) {
          patch.reviewed_at = new Date().toISOString();
          events.push(["reviewed", { app_review: r.app_review }]);
        }
      } catch (err) {
        if (err instanceof ConfigMissing) throw err;
        errors.push(`Review: ${errText(err)}`);
      }
    }
    patch.slow_checked_at = new Date().toISOString();
  }

  await tx(async (c) => {
    const keys = Object.keys(patch);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    await c.query(`update ursp_targets set ${[...sets, "tracked_at = now()", "updated_at = now()"].join(", ")} where id = $1`, [t.id, ...keys.map((k) => patch[k])]);
    for (const [type, detail] of events) await logEvent(c, t.id, type, actor, detail);
    if (errors.length) await logEvent(c, t.id, "track_failed", actor, { errors });
  });
}

async function trackBatch(cfg: UrspSettings): Promise<{ tracked: number; remaining: number; errors: string[] }> {
  const p = await db();
  const due = `status = 'sent' and sent_at > now() - make_interval(days => $1) and (tracked_at is null or tracked_at < now() - interval '10 minutes')`;
  const { rows } = await p.query<UrspTarget>(`select * from ursp_targets where ${due} order by tracked_at nulls first, sent_at desc limit $2`, [
    cfg.tracking_days,
    TRACK_BATCH,
  ]);
  const out = { tracked: 0, remaining: 0, errors: [] as string[] };
  for (const t of rows) {
    try {
      await trackOne(t, cfg);
      out.tracked++;
    } catch (err) {
      out.errors.push(errText(err));
      if (err instanceof ConfigMissing) break;
    }
  }
  out.remaining = (await p.query<{ n: number }>(`select count(*)::int as n from ursp_targets where ${due}`, [cfg.tracking_days])).rows[0]?.n ?? 0;
  out.errors = [...new Set(out.errors)];
  return out;
}

/* ---------------------------------------------------------------- the job */

export type JobState = {
  at: string;
  sent: number;
  tracked: number;
  remaining: number;
  errors: string[];
};

let running: Promise<JobState | null> | null = null;

/** One run: Recap (every 5 min), Active (hourly), send, track. Nothing while paused; `force` reads both sources now. */
export function runJob(force = false): Promise<JobState | null> {
  if (!running) running = job(force).finally(() => (running = null));
  return running;
}

async function job(force: boolean): Promise<JobState | null> {
  const run = await runState();
  if (!run.on) return null;
  const cfg = await getUrspSettings();
  const out: JobState = { at: new Date().toISOString(), sent: 0, tracked: 0, remaining: 0, errors: [] };

  if (cfg.recap_enabled) {
    const last = await getState<RecapResult>("recap_read");
    if (force || age(last?.at ?? null) > RECAP_EVERY_MS) {
      try {
        const r = await readRecapSheet();
        if (r) {
          await setState("recap_read", r);
          await setState("recap", r);
        }
      } catch (err) {
        out.errors.push(`Recap: ${errText(err)}`);
        await setState("recap_read", { at: new Date().toISOString(), source: "sheet", read: 0, added: 0, responsive: 0, targets: 0, note: errText(err) });
      }
    }
  }
  if (cfg.active_enabled) {
    const last = await getState<ActiveResult>("active");
    if (force || age(last?.at ?? null) > ACTIVE_EVERY_MS) {
      try {
        const r = await scanActive(cfg);
        await setState("active", r);
        if (r.error) out.errors.push(`Active: ${r.error}`);
      } catch (err) {
        out.errors.push(`Active: ${errText(err)}`);
        await setState("active", { at: new Date().toISOString(), listed: 0, active_today: 0, looked: 0, targets: 0, field: null, keys: [], error: errText(err) });
      }
    }
  }
  try {
    const s = await sendDue(cfg);
    out.sent = s.sent;
    out.errors.push(...s.errors.map((e) => `Gửi: ${e}`));
  } catch (err) {
    out.errors.push(`Gửi: ${errText(err)}`);
  }
  try {
    const t = await trackBatch(cfg);
    Object.assign(out, { tracked: t.tracked, remaining: t.remaining });
    out.errors.push(...t.errors.map((e) => `Theo dõi: ${e}`));
  } catch (err) {
    out.errors.push(`Theo dõi: ${errText(err)}`);
  }
  out.errors = [...new Set(out.errors)];
  await setState("job", out);
  return out;
}

const TICK_MS = 2 * 60_000;
let started = false;

/** Every two minutes, from instrumentation.ts. Postgres only; off with URSP_DISABLE_TIMER=1. */
export function startUrspTimer(): void {
  if (started || !hasUrspDatabase() || process.env.URSP_DISABLE_TIMER === "1") return;
  started = true;
  const tick = () =>
    runJob().then(
      (r) => {
        if (r?.errors.length) console.error("[ursp]", JSON.stringify(r));
      },
      (err) => console.error("[ursp] run failed", err),
    );
  setTimeout(tick, 75_000).unref?.();
  setInterval(tick, TICK_MS).unref?.();
}

/* ---------------------------------------------------------------- admin */

export type TargetAction = "approve" | "skip" | "edit" | "done" | "undone" | "retry" | "send_anyway" | "track";

/** What an admin does to one row. Each is allowed only from the states it makes sense in. */
export async function targetAction(id: string, action: TargetAction, by: string, text?: string): Promise<void> {
  if (!/^\d+$/.test(id)) throw new UpsellError("Không có row này.", 404);
  const p = await db();
  const { rows } = await p.query<UrspTarget>("select * from ursp_targets where id = $1", [id]);
  const t = rows[0];
  if (!t) throw new UpsellError("Không có row này.", 404);
  const msg = text?.trim();
  if (msg !== undefined && (msg.length < 20 || msg.length > 5000)) throw new UpsellError("Tin nhắn phải từ 20 tới 5000 ký tự.", 422);
  const cfg = await getUrspSettings();
  const only = (...st: string[]) => {
    if (!st.includes(t.status)) throw new UpsellError(`Row đang ở trạng thái "${t.status}" — không làm được việc này.`, 409);
  };
  const set = async (sql: string, params: unknown[], event: string, detail: Record<string, unknown> = {}) =>
    tx(async (c) => {
      await c.query(`update ursp_targets set ${sql}, updated_at = now() where id = $1`, [id, ...params]);
      await logEvent(c, id, event, by, detail);
    });

  switch (action) {
    case "approve":
      only("pending");
      return set("status = 'approved', approved_by = $2, message = coalesce($3, message)", [by, msg ?? null], "approved");
    case "edit":
      only("pending", "approved", "failed");
      if (!msg) throw new UpsellError("Thiếu nội dung tin.", 422);
      return set("message = $2", [msg], "edited");
    case "skip":
      only("pending", "approved", "failed");
      return set("status = 'skipped', skip_code = 'admin', skip_reason = $2", [`${SKIP_REASONS.admin} (${by})`], "skipped", { code: "admin" });
    case "retry":
      only("failed");
      return set("status = 'approved', error = null, wait_until = null", [], "retry");
    case "send_anyway": {
      only("skipped");
      if (t.segment === "recap" && !t.session_id) throw new UpsellError("Row Recap này không có ticket Crisp để gửi vào.", 409);
      if (t.segment === "active" && !t.email) throw new UpsellError("Store này không có email để mở hội thoại.", 409);
      const message = msg ?? composeMessage(t.segment, t, cfg);
      return set(
        `status = '${cfg.mode === "auto" ? "approved" : "pending"}', skip_code = null, skip_reason = null, message = $2, approved_by = $3`,
        [message, cfg.mode === "auto" ? by : null],
        "send_anyway",
        { was: t.skip_code },
      );
    }
    case "done":
      only("sent");
      if (t.done_at) return;
      return set("done_at = now(), done_by = $2", [by], "done");
    case "undone":
      only("sent");
      return set("done_at = null, done_by = null", [], "undone");
    case "track":
      only("sent");
      return trackOne(t, cfg, { force: true, actor: by });
  }
}
