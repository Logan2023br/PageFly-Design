import "server-only";

import { randomBytes } from "node:crypto";
import type { Db } from "./db";

/* Small things every part of the module needs. */

/** No 0/O/1/I: these get read aloud and typed from screenshots. */
const ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** 8 characters from 32 = 40 bits, unguessable for a link nobody can list. */
export function newDesignId(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % 32];
  return out;
}

export function newMessageId(): string {
  return `msg_${randomBytes(9).toString("base64url")}`;
}

/** Where links we mint point. Set PFD_PUBLIC_URL on the VPS; without it the
    production hostname, never a request's `localhost:3000` behind nginx. */
export function upsellOrigin(): string {
  const configured = process.env.PFD_PUBLIC_URL?.trim();
  return (configured || "https://pagefly-design.pagefly.io").replace(/\/+$/, "");
}

export const designUrl = (id: string) => `${upsellOrigin()}/new-page?id=${id}`;
export const adminLeadUrl = (leadId: string) => `${upsellOrigin()}/admin/upsell/leads/${leadId}`;

export function ttlDays(): number {
  const n = Number(process.env.UPSELL_DEFAULT_TTL_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** `admin:{name}` for the screens, `claude` for API callers. */
export type Actor = string;

export async function recordEvent(
  c: Db,
  e: {
    lead_id: string | null;
    design_id?: string | null;
    type: string;
    actor: Actor;
    page_slot?: number | null;
    rating?: number | null;
    comment?: string | null;
    detail?: Record<string, unknown> | null;
    visitor_id?: string | null;
    ip_hash?: string | null;
    user_agent?: string | null;
  },
): Promise<void> {
  await c.query(
    `insert into upsell_events
       (lead_id, design_id, type, actor, page_slot, rating, comment, detail, visitor_id, ip_hash, user_agent)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      e.lead_id,
      e.design_id ?? null,
      e.type,
      e.actor,
      e.page_slot ?? null,
      e.rating ?? null,
      e.comment ?? null,
      e.detail ? JSON.stringify(e.detail) : null,
      e.visitor_id ?? null,
      e.ip_hash ?? null,
      e.user_agent ? e.user_agent.slice(0, 400) : null,
    ],
  );
}

/** Statuses whose names are event types of their own; any other move is
    recorded as `status_changed`. Every move carries {from, to} either way. */
const NAMED_STATUS_EVENTS = new Set(["building", "approved", "rebuild_requested", "rejected", "upgraded", "uninstalled"]);

export async function recordStatus(
  c: Db,
  leadId: string,
  from: string,
  to: string,
  actor: Actor,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (from === to) return;
  await recordEvent(c, {
    lead_id: leadId,
    type: NAMED_STATUS_EVENTS.has(to) ? to : "status_changed",
    actor,
    detail: { from, to, ...extra },
  });
}

/** Fill {store_name} {page1_label} … in a template. Unknown names stay as
    written, so a typo in the template is visible in the draft. */
export function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export const DEFAULT_INITIAL_TEMPLATE =
  "Hi **{store_name}**,\n\n" +
  "Welcome to PageFly! To help you get started, our team designed 2 pages for your store, " +
  "built with your own products: a **{page1_label}** and a **{page2_label}**. They're free, " +
  "and you can import them into PageFly in about a minute.\n\n" +
  /* A plain link: Crisp renders neither **[text](url)** nor [**text**](url) —
     both arrive as raw markdown. */
  "👉 [See your 2 pages]({link})\n\n" +
  "Feel free to customize these pages in the PageFly editor to make them your own.\n\n" +
  "We also offer complimentary editing services for these two pages of yours. " +
  "(Please note that this is a free editing service, available for a limited period of 15 days from the date of submission.)\n\n" +
  "If you need any assistance, simply reply to this message.\n\n" +
  "Best regards,\n**{pic} – PageFly Support**";

/** Pages built for a password-protected store carry example products, so the
    first message must not claim they use the store's own. The phrase is
    swapped in whichever template is in use, the default or Settings'. */
export const OWN_PRODUCTS_PHRASE = "built with your own products";
export const SAMPLE_PRODUCTS_PHRASE = "ready for your own products and photos";

export function sampleTemplate(tpl: string): string {
  return tpl.split(OWN_PRODUCTS_PHRASE).join(SAMPLE_PRODUCTS_PHRASE);
}

export function isoOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(String(v));
  /* Seconds, like every timestamp the API returns (see db.ts) — so a value
     the script echoes back compares equal to the one stored. */
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
