import "server-only";

import {
  ConfigMissing,
  ac2Store,
  ac2Stores,
  ac2UpgradeTime,
  addSegment,
  removeSegment,
  conversationMessages,
  crispSender,
  customerSegments,
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
import { classifyCategories, readReply, summarizeReply } from "./ai";
import { db, getState, hasUrspDatabase, logEvent, setState, tx } from "./db";
import { campaignOver, getUrspSettings, runState, type UrspSettings } from "./settings";
import { SEGMENTS, SKIP_REASONS, unnumbered, type Segment, type SkipCode, type UrspTarget } from "./types";

/* ==========================================================================
   Upsell Responsive: who gets Logan's offer, the offer, and what came of it.

     recap    new rows of the support Recap sheet ("Recap v11"), whatever
              the ticket was about (recap_only_responsive: only those Haiku
              calls responsive), whose resolution is not one of the skipped
              ones → the offer, in that same ticket. Read every 5 minutes, from where the last read
              ended — rows written before Bắt đầu are never read. Straight
              from Google (URSP_SHEET_SA_JSON, sheet shared with it)
              or posted in by n8n (POST /api/ursp/recap).
     active   once an hour, AC2's store list: stores active today (Vietnam
              time) → the offer, in their latest Crisp conversation if they
              have one, else a new one (which reaches them by email).

   Both: a paying Shopify plan, no more than max_published_pages published,
   installed, and one message per store whatever the segment. Every store
   looked at is kept — sent, or skipped with the reason — so the screen can
   say how many were found, how many left out and why.

   The offer lasts offer_days (3) from when it is sent. Read and no reply a
   day later (followup_after_hours), while it lasts: one reminder in the
   same conversation — free, and when it ends.

   After it goes: read / reply from Crisp (a reply puts a note on the ticket
   mentioning Logan, and Haiku reads what they want and how they feel), and a
   few times a day the plan (AC2) and app_review (Crisp) — so it shows
   whether a store upgraded or reviewed after the team handled it.

   Nothing runs while the screen says Tạm dừng.
   ========================================================================== */

const RECAP_SHEET_ID = process.env.URSP_RECAP_SHEET_ID ?? "164dn2Er7xjcwOtudVts7fahT8iiIoV6bNX8HHyx5pEg";
const RECAP_TAB = process.env.URSP_RECAP_TAB ?? "Recap v11";
/** The tab in A1 notation: quoted, its name has a space (and never the Recap Log tab beside it) */
const TAB = `'${RECAP_TAB.replaceAll("'", "''")}'`;
export const RECAP_SHEET_URL = `https://docs.google.com/spreadsheets/d/${RECAP_SHEET_ID}/edit`;
/**
 * The service account that reads the Recap sheet — its own variable, not
 * SHEET_SERVICE_ACCOUNT_JSON, which would also switch the allowlist to it.
 * GOOGLE_SA_JSON is BPU Ops' name for the same kind of key.
 */
export const recapServiceAccount = (): string | null => process.env.URSP_SHEET_SA_JSON?.trim() || process.env.GOOGLE_SA_JSON?.trim() || null;
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
    .replace(/[\u0300-\u036f]/g, "")
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

/* Crisp renders **bold** in chat and in the email it sends (a single *
   is italic). Built to be
   answered: who we are, why now (BFCM shoppers are on their phones), what
   they get (ALL pages, FREE, nothing to do), that it lasts 3 days, and one
   easy reply. The customer's name and Logan's are bold CAPITALS, the time bold.

   {deadline} is the offer's last day — offer_days after the message goes —
   so it stays in the text until it is sent, and is written in then. */
const OFFER = `For a limited time, our experts will:
✅ **Review the responsive layout of ALL your PageFly pages** — mobile, tablet and desktop
✅ **Fix every issue we find, 100% FREE** — no work needed on your side

Most of your **BLACK FRIDAY** shoppers will browse and buy **on their phones**, so a page that breaks on mobile can quietly cost you sales.

⏰ This free offer is valid for **{offer_days} DAYS only** — until **{deadline}**.

👉 **Just reply "YES" to this message** and we will get started right away.

Best regards,
**{pic}** – PageFly Technical Team`;

const DEFAULT_FOLLOWUP = `Hi **{store_name}** team,

Just a quick follow-up from **{pic}** 😊

Your **FREE responsive review & fix** offer expires on **{deadline}** — after that, this free service is no longer available.

✅ We check **ALL your PageFly pages** on mobile, tablet and desktop
✅ We fix every issue we find, **100% FREE** — you don't need to do anything

Your **BLACK FRIDAY** shoppers are on their way. Want us to make sure your store is ready for them?

👉 **Just reply "YES"** and our team will start right away.

Best regards,
**{pic}** – PageFly Technical Team`;

/** The reminder for an offer sent before it lasted 3 days: it promised the end of November. */
const FOLLOWUP_NOVEMBER = `Hi **{store_name}** team,

Just a quick follow-up from **{pic}** 😊

Our **FREE responsive review & fix service** is only available **in NOVEMBER** — the last day is **{end_date}**.

✅ We check **ALL your PageFly pages** on mobile, tablet and desktop
✅ We fix every issue we find, **100% FREE** — you don't need to do anything

Your **BLACK FRIDAY** shoppers are on their way. Want us to make sure your store is ready for them?

👉 **Just reply "YES"** and our team will start right away.

Best regards,
**{pic}** – PageFly Technical Team`;

const DEFAULT_TEMPLATES: Record<Segment, string> = {
  recap: `Hi **{store_name}** team,

This is **{pic}** from the **PageFly Technical Team** 👋

Thank you for reaching out to us recently! Before the **BLACK FRIDAY – CYBER MONDAY** rush, we would love to make sure **EVERY page** of your store looks perfect on every screen.

${OFFER}`,
  active: `Hi **{store_name}** team,

This is **{pic}** from the **PageFly Technical Team** 👋

**BLACK FRIDAY – CYBER MONDAY** is the busiest week of the year — let's make sure **EVERY page** of your store looks perfect on every screen before your visitors arrive.

${OFFER}`,
};

/* Variant B of the A/B test — another angle: short, opens with a question,
   personal, one ask. Same facts (free, every page, no work, 3 days). */
const B_BODY = `I'm **{pic}** from PageFly. Before **BLACK FRIDAY**, my team is checking stores for free: we go through **every PageFly page** on mobile and **fix anything that's off — at no cost, no work on your side**.

This free check is open until **{deadline}**.

Want me to book one for **{store_name}**? Just reply **"YES"** 🙂

**{pic}** – PageFly Technical Team`;

const DEFAULT_TEMPLATES_B: Record<Segment, string> = {
  recap: `Hi **{store_name}** 👋

Thanks for reaching out to us recently! Quick question — have you checked how your store looks **on a phone** lately?

${B_BODY}`,
  active: `Hi **{store_name}** 👋

Quick question — have you checked how your store looks **on a phone** lately?

${B_BODY}`,
};

const DEFAULT_FOLLOWUP_B = `Hi **{store_name}** 👋

**{pic}** here again — just making sure you saw this 🙂

Your **free mobile check & fix** for **{store_name}** ends on **{deadline}**. After that, it is no longer free.

We do all the work — you just reply **"YES"**.

**{pic}** – PageFly Technical Team`;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11-30" → "November 30" */
export function endDateText(ymd: string): string {
  const m = ymd.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}` : ymd;
}

/** When an offer sent at `from` ends: offer_days later. */
export const offerUntil = (cfg: UrspSettings, from = new Date()) => new Date(from.getTime() + cfg.offer_days * 86_400_000);

/** "November 12" — the day `at` falls on, Vietnam time. */
export const deadlineText = (at: Date | string) => endDateText(new Date(new Date(at).getTime() + 7 * 3_600_000).toISOString().slice(0, 10));

/** {deadline} written in — when the message goes, or for a reminder of one that went. */
export const withDeadline = (text: string, until: Date | string) => text.replaceAll("{deadline}", deadlineText(until));

/** `variant` B: the A/B test's other message (its own templates on the Cài đặt tab). */
export function composeMessage(
  segment: Segment | "followup" | "followup_november",
  t: { store_name: string | null; store_domain: string },
  cfg: UrspSettings,
  variant: string | null = null,
): string {
  const b = variant === "B";
  const tpl =
    segment === "followup"
      ? (b ? cfg.followup_template_b : cfg.followup_template).trim() || (b ? DEFAULT_FOLLOWUP_B : DEFAULT_FOLLOWUP)
      : segment === "followup_november"
        ? FOLLOWUP_NOVEMBER
        : b
          ? (segment === "recap" ? cfg.recap_template_b : cfg.active_template_b).trim() || DEFAULT_TEMPLATES_B[segment]
          : (segment === "recap" ? cfg.recap_template : cfg.active_template).trim() || DEFAULT_TEMPLATES[segment];
  /* in capitals; a * in the name would end the bold early */
  const name = (t.store_name?.trim() || t.store_domain.replace(/\.myshopify\.com$/, "")).replaceAll("*", "").toUpperCase();
  return tpl
    .replaceAll("{store_name}", name)
    .replaceAll("{pic}", cfg.sender_name.toUpperCase())
    .replaceAll("{offer_days}", String(cfg.offer_days))
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
  /** qualifying, but kept back — "held", nothing sent (the B half of an A/B split) */
  hold?: boolean;
};

/** Skipped for a reason that can change: the store is looked at again when it comes up again. */
const RECONSIDER: SkipCode[] = ["resolution", "no_ac2", "uninstalled", "shopify_unpaid", "too_many_pages", "no_email", "contacted", "no_ticket"];

/**
 * The offer already went — or is going — to this store or this email,
 * under any row but `id`: never twice, whatever the segment or the route
 * (the job, n8n's post, Vẫn gửi). The last check before a send, too.
 */
async function alreadySent(id: string | null, domain: string, email: string | null): Promise<UrspTarget | null> {
  const { rows } = await (await db()).query<UrspTarget>(
    `select * from ursp_targets
      where ($1::bigint is null or id <> $1::bigint) and status in ('sent', 'sending')
        and (store_domain = $2 or ($3::text is not null and lower(email) = lower($3::text)))
      order by sent_at nulls last limit 1`,
    [id, domain, email],
  );
  return rows[0] ?? null;
}

const sentReason = (d: UrspTarget, domain: string) =>
  `${SKIP_REASONS.already_sent} — ${d.store_domain === domain ? "" : `cùng email với ${d.store_domain}, `}${SEGMENTS[d.segment].label}${d.sent_at ? ` ${new Date(d.sent_at).toISOString().slice(0, 10)}` : ""}`;

/**
 * A segment that says "leave this customer alone" (dev, bad-review…) on any
 * of their Crisp conversations — null when there is none.
 */
async function blockedBy(cfg: UrspSettings, email: string | null, sid: string | null): Promise<string | null> {
  const blocked = cfg.blocked_segments
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!blocked.length || (!email && !sid)) return null;
  const have = await customerSegments(email, sid);
  return blocked.find((b) => have.has(b)) ?? null;
}

const blockedReason = (seg: string) => `Khách có segment "${seg}" trên Crisp`;

/**
 * The half a new store joins: whichever has fewer stores of its segment
 * (sent, queued, or held for B) — so B fills up to A first, then the two
 * grow evenly, and both always have Recap and Active alike. Even: at random.
 */
async function balancedVariant(segment: Segment): Promise<"A" | "B"> {
  const { rows } = await (await db()).query<{ a: number; b: number }>(
    `select count(*) filter (where variant = 'A')::int as a, count(*) filter (where variant = 'B')::int as b
       from ursp_targets where segment = $1 and status <> 'skipped'`,
    [segment],
  );
  const { a, b } = rows[0] ?? { a: 0, b: 0 };
  return a === b ? (Math.random() < 0.5 ? "A" : "B") : a < b ? "A" : "B";
}

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
  if (!skip) {
    const dup = await alreadySent(same?.id ?? null, n.store_domain, facts.email);
    if (dup) skip = { code: "already_sent", reason: sentReason(dup, n.store_domain) };
  }
  if (!skip) {
    const seg = await blockedBy(cfg, facts.email, n.session_id ?? null);
    if (seg) skip = { code: "blocked_segment", reason: blockedReason(seg) };
  }
  let session_id = n.session_id ?? null;
  let ticket_link = n.ticket_link ?? null;
  if (!skip && n.segment === "active") {
    if (!facts.email) skip = { code: "no_email", reason: SKIP_REASONS.no_email };
    else {
      /* talked to support before: the message goes in their latest
         conversation; never: a new one is opened when it is sent */
      const r = await reviewCheck(facts.email);
      if (r.conversations[0]) {
        session_id = r.conversations[0].session_id;
        ticket_link = r.conversations[0].link;
      }
    }
  }

  const status = skip ? "skipped" : n.hold ? "held" : cfg.mode === "auto" ? "approved" : "pending";
  /* ab_split on: the half with fewer stores of this segment; off: A. A held one is given its half later. */
  const variant = skip || n.hold ? null : cfg.ab_split ? await balancedVariant(n.segment) : "A";
  const message = skip ? null : composeMessage(n.segment, { store_name: facts.store_name, store_domain: n.store_domain }, cfg, variant);
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
      variant,
    ];
    const { rows } = await c.query<{ id: string }>(
      `insert into ursp_targets (segment, store_domain, recap_key, email, store_name, country, shopify_plan, pf_plan, pf_price, pages_published,
                                 session_id, ticket_link, source, status, skip_code, skip_reason, message, approved_by, first_price, first_ac2_at, variant)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, case when $19::numeric is null then null else now() end, $20)
       on conflict (segment, store_domain) do update set
         recap_key = excluded.recap_key, email = excluded.email, store_name = excluded.store_name, country = excluded.country,
         shopify_plan = excluded.shopify_plan, pf_plan = excluded.pf_plan, pf_price = excluded.pf_price, pages_published = excluded.pages_published,
         session_id = excluded.session_id, ticket_link = excluded.ticket_link, source = excluded.source, status = excluded.status,
         skip_code = excluded.skip_code, skip_reason = excluded.skip_reason, message = excluded.message, approved_by = excluded.approved_by,
         first_price = excluded.first_price, first_ac2_at = excluded.first_ac2_at, variant = excluded.variant, updated_at = now()
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
 * and each one looked at as a target.
 */
export async function ingestRecap(
  rows: RecapIn[],
  source: RecapResult["source"],
  actor: string,
  opts: { hold?: boolean; made?: { id: string; status: string; day: string }[] } = {},
): Promise<RecapResult> {
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

  /* Every new row is a target — unless recap_only_responsive asks Haiku
     first (once per spelling never seen before). */
  const onlyResponsive = cfg.recap_only_responsive === 1;
  const known = new Map<string, boolean>();
  if (onlyResponsive) {
    const values = [...new Set(fresh.map((r) => r.category_issue).filter((v): v is string => !!v))];
    for (const r of (await p.query<{ category: string; responsive: boolean }>("select category, responsive from ursp_categories where category = any($1)", [values])).rows)
      known.set(r.category, r.responsive);
    for (const c of await classifyCategories(values.filter((v) => !known.has(v)))) {
      known.set(c.value, c.responsive);
      await p.query("insert into ursp_categories (category, responsive, by) values ($1, $2, $3) on conflict (category) do nothing", [c.value, c.responsive, c.by]);
    }
  }

  for (const r of fresh) {
    const taken = !onlyResponsive || (r.category_issue ? (known.get(r.category_issue) ?? false) : false);
    /* responsive: whether the row was taken (all of them, unless only responsive ones are) */
    await p.query("update ursp_recap_rows set responsive = $2 where row_key = $1", [r.key, taken]);
    if (!taken) continue;
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
        hold: opts.hold,
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
      opts.made?.push({ ...t, day: r.recap_at ? vnDay(new Date(r.recap_at).getTime()) : "" });
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

export type BackfillState = {
  at: string;
  from: string;
  by: string;
  running: boolean;
  rows: number;
  stores: number;
  /** half of each day's qualifying stores sent (A), the other half held for B */
  split?: boolean;
  sent_half?: number;
  held_half?: number;
  result?: RecapResult;
  error?: string;
};

/**
 * Rows already in the sheet from `from` (Vietnam date) on — the ones before
 * Bắt đầu that "only new rows" leaves out — taken as if they had just come.
 * The latest row per store only, so today's resolution decides. Runs in
 * the background; the screen reads `recap_backfill` for how it went.
 *
 * `split`: of the stores that qualify, each Recap day's are shuffled and
 * half get the message now (variant A); the other half are held — nothing
 * sent, not messaged by Active either — for the B message of an A/B test.
 */
export async function startRecapBackfill(from: string, by: string, split = false): Promise<BackfillState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new UpsellError("Ngày phải dạng YYYY-MM-DD.", 422);
  const sa = recapServiceAccount();
  if (!sa) throw new UpsellError("Server chưa đọc được file Recap (URSP_SHEET_SA_JSON chưa đặt).", 409);
  const cur = await getState<BackfillState>("recap_backfill");
  if (cur?.running && Date.now() - new Date(cur.at).getTime() < 30 * 60_000) throw new UpsellError("Đang chạy một lượt — đợi xong.", 409);
  const state: BackfillState = { at: new Date().toISOString(), from, by, running: true, rows: 0, stores: 0, split };
  await setState("recap_backfill", state);
  void (async () => {
    try {
      const values = await readSheetValues(RECAP_SHEET_ID, `${TAB}!A1:BH`, sa);
      const header = values[0] ?? [];
      const since = Date.parse(`${from}T00:00:00+07:00`);
      const rows = values
        .slice(1)
        .map((cells, i) => recapRow(Object.fromEntries(header.map((h, j) => [h, cells[j] ?? ""])), i + 2))
        .filter((r) => r.recap_at && new Date(r.recap_at).getTime() >= since);
      /* the latest row of each store; rows without a store are kept, to be counted */
      const latest = new Map<string, RecapIn>();
      const loose: RecapIn[] = [];
      for (const r of rows) {
        if (!r.store_domain) loose.push(r);
        else if (!latest.has(r.store_domain) || r.recap_at! >= latest.get(r.store_domain)!.recap_at!) latest.set(r.store_domain, r);
      }
      const take = [...latest.values(), ...loose].sort((a, b) => a.recap_at!.localeCompare(b.recap_at!));
      await setState("recap_backfill", { ...state, rows: rows.length, stores: latest.size });
      const made: { id: string; status: string; day: string }[] = [];
      const result = await ingestRecap(take, "sheet", by, { hold: split, made });
      const halves = split ? await splitHalves(made.filter((m) => m.status === "held")) : {};
      await setState("recap_backfill", { ...state, running: false, rows: rows.length, stores: latest.size, result, ...halves });
    } catch (err) {
      await setState("recap_backfill", { ...state, running: false, error: errText(err) });
    }
  })();
  return state;
}

export type SegmentCleanup = { at: string; by: string; running: boolean; checked: number; removed: number; kept: number; errors: number };

/**
 * Once: the segment came with every offer before it meant "agreed" — it is
 * taken off every conversation except those where the customer replied or
 * the case is (or was) in hand. In the background, a little at a time
 * (Crisp limits bursts).
 */
export async function startSegmentCleanup(by: string): Promise<SegmentCleanup> {
  const cfg = await getUrspSettings();
  const seg = cfg.crisp_segment.trim();
  if (!seg) throw new UpsellError("Chưa đặt crisp_segment.", 409);
  const cur = await getState<SegmentCleanup>("segment_cleanup");
  if (cur?.running && Date.now() - new Date(cur.at).getTime() < 60 * 60_000) throw new UpsellError("Đang dọn — đợi xong.", 409);
  const state: SegmentCleanup = { at: new Date().toISOString(), by, running: true, checked: 0, removed: 0, kept: 0, errors: 0 };
  await setState("segment_cleanup", state);
  void (async () => {
    const { rows } = await (await db()).query<{ session_id: string; keep: boolean }>(
      `select session_id, (replied_at is not null or working_at is not null or done_at is not null) as keep
         from ursp_targets where status = 'sent' and session_id is not null`,
    );
    for (const r of rows) {
      state.checked++;
      if (r.keep) state.kept++;
      else
        try {
          if (await removeSegment(r.session_id!, seg)) state.removed++;
        } catch {
          state.errors++;
        }
      if (state.checked % 20 === 0) await setState("segment_cleanup", state).catch(() => undefined);
      await new Promise((ok) => setTimeout(ok, 400));
    }
    await setState("segment_cleanup", { ...state, running: false });
  })();
  return state;
}

/**
 * "Gửi bản B": every store held for B gets the B message — queued as any
 * other (auto: goes out at the usual pace; manual: waits on Chờ duyệt).
 * Nothing calls this but the button.
 */
export async function releaseHeldB(by: string): Promise<number> {
  const cfg = await getUrspSettings();
  if (campaignOver(cfg)) throw new UpsellError("Chương trình đã kết thúc — không gửi nữa.", 409);
  const p = await db();
  const { rows } = await p.query<UrspTarget>("select * from ursp_targets where status = 'held' and variant = 'B'");
  let n = 0;
  for (const t of rows) {
    /* sent to meanwhile by another route: never twice */
    const dup = await alreadySent(t.id, t.store_domain, t.email);
    const st = dup ? "skipped" : cfg.mode === "auto" ? "approved" : "pending";
    await tx(async (c) => {
      await c.query(
        `update ursp_targets set status = $2, message = $3, approved_by = $4, skip_code = $5, skip_reason = $6, updated_at = now() where id = $1 and status = 'held'`,
        [t.id, st, dup ? null : composeMessage(t.segment, t, cfg, "B"), st === "approved" ? by : null, dup ? "already_sent" : null, dup ? sentReason(dup, t.store_domain) : null],
      );
      await logEvent(c, t.id, dup ? "skipped" : "released_b", by, {});
    });
    if (!dup) n++;
  }
  return n;
}

/** Each day's held stores, shuffled: the first half (rounded up) released as A, the rest kept as B. */
async function splitHalves(held: { id: string; day: string }[]): Promise<{ sent_half: number; held_half: number }> {
  const cfg = await getUrspSettings();
  const byDay = new Map<string, string[]>();
  for (const h of held) byDay.set(h.day, [...(byDay.get(h.day) ?? []), h.id]);
  const a: string[] = [];
  const b: string[] = [];
  for (const ids of byDay.values()) {
    const shuffled = ids
      .map((id) => ({ id, r: Math.random() }))
      .sort((x, y) => x.r - y.r)
      .map((x) => x.id);
    const cut = Math.ceil(shuffled.length / 2);
    a.push(...shuffled.slice(0, cut));
    b.push(...shuffled.slice(cut));
  }
  const p = await db();
  if (a.length)
    await p.query(
      `update ursp_targets set variant = 'A', status = $2, approved_by = $3, updated_at = now() where id = any($1::bigint[]) and status = 'held'`,
      [a, cfg.mode === "auto" ? "approved" : "pending", cfg.mode === "auto" ? "auto" : null],
    );
  if (b.length) await p.query("update ursp_targets set variant = 'B', updated_at = now() where id = any($1::bigint[]) and status = 'held'", [b]);
  return { sent_half: a.length, held_half: b.length };
}

/**
 * The sheet itself, from the row after the last one read. The first read
 * after Bắt đầu only finds where the sheet ends: what is above it is old.
 */
async function readRecapSheet(): Promise<RecapResult | null> {
  const sa = recapServiceAccount();
  if (!sa) return null;
  const cursor = await getState<{ row: number; header: string[] }>("recap_cursor");
  if (!cursor) {
    const [col, head] = await Promise.all([readSheetValues(RECAP_SHEET_ID, `${TAB}!A:A`, sa), readSheetValues(RECAP_SHEET_ID, `${TAB}!1:1`, sa)]);
    const row = col.length;
    await setState("recap_cursor", { row, header: head[0] ?? [] });
    return { at: new Date().toISOString(), source: "sheet", read: 0, added: 0, responsive: 0, targets: 0, cursor: row, note: `Bắt đầu từ sau dòng ${row}` };
  }
  const values = await readSheetValues(RECAP_SHEET_ID, `${TAB}!A${cursor.row + 1}:BH${cursor.row + RECAP_BATCH}`, sa);
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

/* The private notes on the ticket are in English: the support team reads them. */
const tag = (t: Pick<UrspTarget, "segment" | "variant">) => `[Upsell Responsive · ${SEGMENTS[t.segment].label}${t.variant ? ` · version ${t.variant}` : ""}]`;

/** Fixing their pages needs their store: whoever is on the ticket asks for it — its own line, under the note. */
const ACCESS =
  "If the customer agrees, FL please request collaborator access to the store.\n" +
  "Please tell the customer: our TS team will access the store and check the mobile responsive layout of the pages from 8 AM to 5 PM (GMT+7), Monday to Friday.";

const noteText = (t: Pick<UrspTarget, "segment" | "variant">, cfg: UrspSettings, until: Date | null) =>
  `${tag(t)} ${cfg.sender_name} sent the free BFCM offer: a responsive review of all PageFly pages + free fixes` +
  `${until ? `, valid until ${deadlineText(until)}` : ""}. If the customer replies, mention ${cfg.sender_name} to handle it.\n\n${ACCESS}`;

async function sendOne(t: UrspTarget, cfg: UrspSettings, actor: string): Promise<void> {
  const p = await db();
  if (campaignOver(cfg)) {
    await p.query("update ursp_targets set status = 'skipped', skip_code = 'ended', skip_reason = $2, updated_at = now() where id = $1", [t.id, SKIP_REASONS.ended]);
    return;
  }
  const dup = await alreadySent(t.id, t.store_domain, t.email);
  if (dup) {
    await tx(async (c) => {
      await c.query("update ursp_targets set status = 'skipped', skip_code = 'already_sent', skip_reason = $2, updated_at = now() where id = $1", [
        t.id,
        sentReason(dup, t.store_domain),
      ]);
      await logEvent(c, t.id, "skipped", actor, { code: "already_sent", other: dup.id });
    });
    return;
  }
  /* the customer may have been marked since the store was found */
  const seg = await blockedBy(cfg, t.email, t.session_id);
  if (seg) {
    await tx(async (c) => {
      await c.query("update ursp_targets set status = 'skipped', skip_code = 'blocked_segment', skip_reason = $2, updated_at = now() where id = $1", [t.id, blockedReason(seg)]);
      await logEvent(c, t.id, "skipped", actor, { code: "blocked_segment", segment: seg });
    });
    return;
  }
  const draft = t.message?.trim() || composeMessage(t.segment, t, cfg, t.variant);
  const until = offerUntil(cfg);
  const text = withDeadline(draft, until);
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
      await sendNote(sid, noteText(t, cfg, draft.includes("{deadline}") ? until : null)).catch(() => undefined);
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
        note: noteText(t, cfg, draft.includes("{deadline}") ? until : null),
      });
      sid = r.session_id;
      link = r.ticket_link;
    }
    await tx(async (c) => {
      await c.query(
        `update ursp_targets set status = 'sent', sent_at = now(), sent_by = $2, message = $3, session_id = $4, ticket_link = $5, offer_until = $6,
                error = null, wait_until = null, tracked_at = null, updated_at = now() where id = $1`,
        [t.id, actor, text, sid, link, draft.includes("{deadline}") ? until.toISOString() : null],
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

/* ---------------------------------------------------------------- follow-up */

/**
 * Read, no reply, not handled, followup_after_hours after it was seen: one
 * reminder each — waiting on Chờ duyệt (manual) or going out (auto).
 */
/** The reminder: the 3-day offer's last day, or — for one sent before offers lasted 3 days — November. */
const followupText = (t: UrspTarget, cfg: UrspSettings) =>
  t.offer_until ? withDeadline(composeMessage("followup", t, cfg, t.variant), t.offer_until) : composeMessage("followup_november", t, cfg);

async function queueFollowups(cfg: UrspSettings): Promise<number> {
  if (!cfg.followup_enabled || campaignOver(cfg)) return 0;
  const p = await db();
  const { rows } = await p.query<UrspTarget>(
    `select * from ursp_targets
      where status = 'sent' and followup_status is null and read_at is not null and replied_at is null
        and (offer_until is null or offer_until > now())
        and done_at is null and dismissed_at is null and working_at is null and uninstalled_at is null and session_id is not null
        and read_at <= now() - make_interval(hours => $1)
      order by read_at limit 50`,
    [cfg.followup_after_hours],
  );
  for (const t of rows)
    await tx(async (c) => {
      const st = cfg.mode === "auto" ? "approved" : "pending";
      await c.query(
        "update ursp_targets set followup_status = $2, followup_message = $3, followup_approved_by = $4, updated_at = now() where id = $1 and followup_status is null",
        [t.id, st, followupText(t, cfg), st === "approved" ? "auto" : null],
      );
      await logEvent(c, t.id, "followup_queued", "system", { status: st });
    });
  return rows.length;
}

async function sendFollowups(cfg: UrspSettings): Promise<{ sent: number; errors: string[] }> {
  const p = await db();
  const out = { sent: 0, errors: [] as string[] };
  if (campaignOver(cfg)) return out;
  const { rows } = await p.query<UrspTarget>(
    `update ursp_targets set followup_status = 'sending', updated_at = now()
      where id in (select id from ursp_targets where followup_status = 'approved' and (wait_until is null or wait_until <= now())
                    order by updated_at limit 10 for update skip locked)
      returning *`,
  );
  const sender = rows.length ? await crispSender(cfg.sender_name, "") : null;
  const skip = (id: string) => p.query("update ursp_targets set followup_status = 'skipped', updated_at = now() where id = $1", [id]);
  for (const t of rows) {
    try {
      /* answered or handled meanwhile: no reminder */
      if (t.replied_at || t.done_at) {
        await skip(t.id);
        continue;
      }
      const msgs = await conversationMessages(t.session_id!);
      if (msgs.some((m) => m.from === "user" && Number(m.timestamp) >= new Date(t.sent_at!).getTime())) {
        await skip(t.id);
        continue;
      }
      const lastAt = Math.max(0, ...msgs.map((m) => Number(m.timestamp) || 0));
      if (cfg.quiet_minutes > 0 && Date.now() - lastAt < cfg.quiet_minutes * 60_000) {
        await p.query("update ursp_targets set followup_status = 'approved', wait_until = $2, updated_at = now() where id = $1", [
          t.id,
          new Date(lastAt + cfg.quiet_minutes * 60_000).toISOString(),
        ]);
        continue;
      }
      /* marked dev / bad-review since: no reminder */
      if (await blockedBy(cfg, t.email, t.session_id)) {
        await skip(t.id);
        continue;
      }
      /* the offer ran out while it waited: no reminder */
      if (t.offer_until && new Date(t.offer_until).getTime() <= Date.now()) {
        await skip(t.id);
        continue;
      }
      const text = t.followup_message?.trim() || followupText(t, cfg);
      await sendInConversation(t.session_id!, text, sender!);
      await sendNote(
        t.session_id!,
        `${tag(t)} ${cfg.sender_name} sent a reminder: the customer saw the offer but has not replied${t.offer_until ? ` (offer ends ${deadlineText(t.offer_until)})` : ""}. If they reply, mention ${cfg.sender_name}.\n\n${ACCESS}`,
      ).catch(() => undefined);
      await resolveConversation(t.session_id!).catch(() => undefined);
      await tx(async (c) => {
        await c.query(
          `update ursp_targets set followup_status = 'sent', followup_sent_at = now(), followup_message = $2, followup_error = null,
                  wait_until = null, updated_at = now() where id = $1`,
          [t.id, text],
        );
        await logEvent(c, t.id, "followup_sent", t.followup_approved_by ?? "system", {});
      });
      out.sent++;
    } catch (err) {
      if (err instanceof ConfigMissing) {
        await p.query("update ursp_targets set followup_status = 'approved', updated_at = now() where id = $1", [t.id]);
        out.errors.push(errText(err));
        break;
      }
      await p.query("update ursp_targets set followup_status = 'failed', followup_error = $2, updated_at = now() where id = $1", [t.id, errText(err).slice(0, 500)]);
      out.errors.push(errText(err));
    }
  }
  await p.query("update ursp_targets set followup_status = 'approved' where followup_status = 'sending' and updated_at < now() - interval '15 minutes'");
  return out;
}

/**
 * Stores once left out for having talked to support: that rule is gone,
 * so they are looked at again — a few each run.
 */
async function reconsiderContacted(cfg: UrspSettings): Promise<void> {
  const { rows } = await (await db()).query<UrspTarget>(
    "select * from ursp_targets where status = 'skipped' and skip_code = 'contacted' order by created_at limit 20",
  );
  for (const t of rows)
    await addTarget({ segment: t.segment, store_domain: t.store_domain, source: t.source ?? {}, facts: {} }, cfg, "system").catch((err) => {
      if (err instanceof ConfigMissing) throw err;
    });
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
  const customerNotes: { text: string; at: string }[] = [];
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
          /* a case in hand: what they wrote since goes into its notes, summed up, in turn with the team's */
          if (t.working_at && !t.done_at && !t.dismissed_at) {
            const after = Math.max(t.last_reply_at ? new Date(t.last_reply_at).getTime() : 0, new Date(t.working_at).getTime());
            const fresh = replies.filter((m) => Number(m.timestamp) > after + 999);
            if (fresh.length)
              customerNotes.push({
                text: await summarizeReply(fresh.map((m) => textOf(m.content)).join("\n")),
                at: new Date(Number(fresh[fresh.length - 1].timestamp)).toISOString(),
              });
          }
          const read = await readReply([t.message, t.followup_message].filter(Boolean).join("\n\n---\n\n"), text);
          Object.assign(patch, { reply_intent: read.intent, mood: read.mood, mood_note: read.note || null, classified_at: new Date().toISOString() });
          events.push(["classified", { intent: read.intent, mood: read.mood, by: read.by }]);
          /* the segment marks the ones who said yes — not everyone who was sent the offer */
          if (read.intent === "agree" && cfg.crisp_segment.trim()) {
            await addSegment(t.session_id, cfg.crisp_segment.trim()).catch(() => undefined);
            events.push(["segment", { segment: cfg.crisp_segment.trim() }]);
          }
          /* the first reply: Logan is called in, once */
          if (!t.mentioned_at) {
            const who = await crispSender(cfg.sender_name, "");
            await sendNote(
              t.session_id,
              `${tag(t)} The customer replied to the responsive review offer: "${text.slice(0, 300)}" — @${cfg.sender_name} please take it from here.\n\n${ACCESS}`,
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
    for (const n of customerNotes)
      await c.query("insert into ursp_notes (target_id, stage, text, by, kind, at) values ($1, 'working', $2, 'Khách', 'customer', $3)", [t.id, n.text, n.at]);
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
  followups?: number;
  tracked: number;
  remaining: number;
  errors: string[];
};

let running: Promise<JobState | null> | null = null;
let sending: Promise<SendState | null> | null = null;

export type SendState = { at: string; sent: number; followups: number; errors: string[] };

/**
 * The sending alone — offers and reminders — on its own lock, so it never
 * waits behind tracking (which, after a big batch, can take minutes).
 * The timer starts it every tick beside the job; the job and Cập nhật ngay
 * call it too, and a call while one runs joins that one.
 */
export function runSend(): Promise<SendState | null> {
  if (!sending) sending = sendNow().finally(() => (sending = null));
  return sending;
}

async function sendNow(): Promise<SendState | null> {
  if (!(await runState()).on) return null;
  const cfg = await getUrspSettings();
  const out: SendState = { at: new Date().toISOString(), sent: 0, followups: 0, errors: [] };
  try {
    const s = await sendDue(cfg);
    out.sent = s.sent;
    out.errors.push(...s.errors.map((e) => `Gửi: ${e}`));
  } catch (err) {
    out.errors.push(`Gửi: ${errText(err)}`);
  }
  try {
    await queueFollowups(cfg);
    const f = await sendFollowups(cfg);
    out.followups = f.sent;
    out.errors.push(...f.errors.map((e) => `Nhắc lại: ${e}`));
  } catch (err) {
    out.errors.push(`Nhắc lại: ${errText(err)}`);
  }
  await setState("send", out).catch(() => undefined);
  return out;
}

/** One run: Recap (every 5 min), Active (hourly), send, track. Nothing while paused; `force` reads both sources now. */
export function runJob(force = false): Promise<JobState | null> {
  if (!running) running = job(force).finally(() => (running = null));
  return running;
}

async function job(force: boolean): Promise<JobState | null> {
  const run = await runState();
  if (!run.on) return null;
  const cfg = await getUrspSettings();
  const out: JobState = { at: new Date().toISOString(), sent: 0, followups: 0, tracked: 0, remaining: 0, errors: [] };

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
    await reconsiderContacted(cfg);
  } catch (err) {
    out.errors.push(`Xét lại: ${errText(err)}`);
  }
  const s = await runSend();
  if (s) {
    Object.assign(out, { sent: s.sent, followups: s.followups });
    out.errors.push(...s.errors);
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
  const tick = () => {
    runJob().then(
      (r) => {
        if (r?.errors.length) console.error("[ursp]", JSON.stringify(r));
      },
      (err) => console.error("[ursp] run failed", err),
    );
    /* beside the job, not after it: a long tracking batch never holds the sending up */
    runSend().catch((err) => console.error("[ursp] send failed", err));
  };
  setTimeout(tick, 75_000).unref?.();
  setInterval(tick, TICK_MS).unref?.();
}

/* ---------------------------------------------------------------- admin */

export type TargetAction =
  | "approve"
  | "skip"
  | "edit"
  | "done"
  | "undone"
  | "dismiss"
  | "undismiss"
  | "start"
  | "cancel"
  | "note"
  | "retry"
  | "send_anyway"
  | "track"
  | "approve_followup"
  | "skip_followup"
  | "edit_followup"
  | "retry_followup";

const FOLLOWUP_FROM: Record<string, string[]> = {
  approve_followup: ["pending"],
  edit_followup: ["pending", "approved", "failed"],
  skip_followup: ["pending", "approved", "failed"],
  retry_followup: ["failed"],
};

/** What an admin does to one row. Each is allowed only from the states it makes sense in. */
export async function targetAction(id: string, action: TargetAction, by: string, text?: string): Promise<void> {
  if (!/^\d+$/.test(id)) throw new UpsellError("Không có row này.", 404);
  const p = await db();
  const { rows } = await p.query<UrspTarget>("select * from ursp_targets where id = $1", [id]);
  const t = rows[0];
  if (!t) throw new UpsellError("Không có row này.", 404);
  const msg = text?.trim();
  /* the text is a message, except for Bỏ qua (the reason) and a note */
  if (action !== "dismiss" && action !== "note" && msg !== undefined && (msg.length < 20 || msg.length > 5000)) throw new UpsellError("Tin nhắn phải từ 20 tới 5000 ký tự.", 422);
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
      const dup = await alreadySent(t.id, t.store_domain, t.email);
      if (dup) throw new UpsellError(`Không gửi: ${sentReason(dup, t.store_domain)}.`, 409);
      /* a store sent after all joins the A/B test like any other */
      const variant = t.variant ?? (cfg.ab_split ? await balancedVariant(t.segment) : "A");
      const message = msg ?? composeMessage(t.segment, t, cfg, variant);
      return set(
        `status = '${cfg.mode === "auto" ? "approved" : "pending"}', skip_code = null, skip_reason = null, message = $2, approved_by = $3, variant = $4`,
        [message, cfg.mode === "auto" ? by : null, variant],
        "send_anyway",
        { was: t.skip_code },
      );
    }
    case "approve_followup":
    case "edit_followup":
    case "skip_followup":
    case "retry_followup":
      if (!FOLLOWUP_FROM[action].includes(t.followup_status ?? ""))
        throw new UpsellError(`Tin nhắc lại đang ở trạng thái "${t.followup_status ?? "chưa có"}" — không làm được việc này.`, 409);
      if (action === "approve_followup")
        return set("followup_status = 'approved', followup_approved_by = $2, followup_message = coalesce($3, followup_message)", [by, msg ?? null], "followup_approved");
      if (action === "edit_followup") {
        if (!msg) throw new UpsellError("Thiếu nội dung tin.", 422);
        return set("followup_message = $2", [msg], "followup_edited");
      }
      if (action === "retry_followup") return set("followup_status = 'approved', followup_error = null, wait_until = null", [], "followup_retry");
      return set("followup_status = 'skipped'", [], "followup_skipped");
    case "note": {
      only("sent");
      const body = unnumbered(text ?? "");
      if (!body || body.length > 2000) throw new UpsellError("Ghi chú từ 1 tới 2000 ký tự.", 422);
      const stage = t.dismissed_at ? "dismissed" : t.done_at ? "done" : t.working_at ? "working" : "open";
      await (await db()).query("insert into ursp_notes (target_id, stage, text, by) values ($1, $2, $3, $4)", [id, stage, body, by]);
      return;
    }
    case "start":
      only("sent");
      if (t.dismissed_at) throw new UpsellError("Store này đã bị bỏ qua — hoàn tác trước.", 409);
      if (t.working_at) return;
      return set("working_at = now(), working_by = $2", [by], "working");
    case "cancel":
      only("sent");
      return set("working_at = null, working_by = null, done_at = null, done_by = null", [], "cancelled");
    case "dismiss": {
      only("sent");
      const why = text?.trim() ?? "";
      if (why.length < 2 || why.length > 500) throw new UpsellError("Ghi lý do bỏ qua (2–500 ký tự).", 422);
      if (t.done_at || t.working_at) throw new UpsellError("Store này đang / đã xử lý — huỷ trước rồi mới bỏ qua.", 409);
      return set("dismissed_at = now(), dismissed_by = $2, dismiss_reason = $3", [by, why], "dismissed", { reason: why });
    }
    case "undismiss":
      only("sent");
      return set("dismissed_at = null, dismissed_by = null, dismiss_reason = null", [], "undismissed");
    case "done":
      only("sent");
      if (t.done_at) return;
      if (t.dismissed_at) throw new UpsellError("Store này đã bị bỏ qua — hoàn tác trước.", 409);
      /* done means it was worked on: a store marked done straight away was in hand too */
      return set("done_at = now(), done_by = $2, working_at = coalesce(working_at, now()), working_by = coalesce(working_by, $2)", [by], "done");
    case "undone":
      only("sent");
      return set("done_at = null, done_by = null", [], "undone");
    case "track":
      only("sent");
      return trackOne(t, cfg, { force: true, actor: by });
  }
}
