import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { clientIp as clientIpOf, rateLimited } from "@/lib/rateLimit";
import { db, tx } from "./db";
import { recordEvent, recordStatus } from "./common";
import { lockLead, updateLead } from "./leads";
import { CUSTOMER_EVENTS, VISIBLE, type CustomerEvent, type LeadStatus } from "./types";

/* ==========================================================================
   What the customer does on /new-page, counted honestly.

   NOT COUNTED: bots and link unfurlers (a Crisp or Slack preview of the link
   would otherwise be the merchant's "first view"), an admin's own session,
   and anything past 30 events a minute from one visitor. The IP is kept only
   as a salted SHA-256 — enough to see one person on two browsers, not enough
   to say who.
   ========================================================================== */

export const VISITOR_COOKIE = "pfd_uv";
export const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;

const BOT_UA =
  /bot|crawl|spider|preview|fetch|headless|slurp|facebookexternalhit|facebot|crisp|slack|whatsapp|telegram|discord|skype|embedly|quora|pinterest|vkshare|w3c_validator|lighthouse|google-?(?:site|read|structured|inspection)|bingpreview|python-requests|curl\/|wget/i;

export function isBot(ua: string | null | undefined): boolean {
  return !ua || BOT_UA.test(ua);
}

export function newVisitorId(): string {
  return randomBytes(12).toString("base64url");
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  /* A secret salt, or the hash of an IPv4 address is a lookup table away from
     the address. UPSELL_IP_SALT if set; else a secret this deployment already
     has; the public default only where there is neither (development). */
  const salt = process.env.UPSELL_IP_SALT || process.env.SESSION_SECRET || process.env.UPSELL_API_KEY || "pfd-upsell-default-salt";
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

/** The caller's address as nginx saw it — the last X-Forwarded-For hop, not
    the first, which the client writes itself. See lib/rateLimit.ts. */
export function clientIp(req: Request): string | null {
  const ip = clientIpOf(req);
  return ip === "unknown" ? null : ip;
}

/* The limiter is the shared, bounded one: a flood of fresh visitor cookies
   cannot grow it without end. Re-exported for the API-key limit in api.ts. */
export { rateLimited };

export type TrackInput = {
  id: string;
  type: string;
  page_slot?: number | null;
  rating?: number | null;
  comment?: string | null;
  detail?: Record<string, unknown> | null;
};

export type TrackContext = {
  visitorId: string;
  ip: string | null;
  userAgent: string | null;
  isAdmin: boolean;
};

export type TrackResult = { recorded: boolean; reason?: string };

export async function trackCustomerEvent(input: TrackInput, ctx: TrackContext): Promise<TrackResult> {
  if (!(CUSTOMER_EVENTS as readonly string[]).includes(input.type)) return { recorded: false, reason: "unknown type" };
  if (ctx.isAdmin) return { recorded: false, reason: "admin" };
  if (isBot(ctx.userAgent)) return { recorded: false, reason: "bot" };
  /* Per visitor, and per address — a new visitor cookie on every request
     must not mean a new allowance. */
  if (rateLimited(`ev:${ctx.visitorId}`, 30)) return { recorded: false, reason: "rate limited" };
  if (ctx.ip && rateLimited(`ev-ip:${ctx.ip}`, 60)) return { recorded: false, reason: "rate limited" };
  if (rateLimited(`ev-design:${input.id}`, 300)) return { recorded: false, reason: "rate limited" };

  const p = await db();
  const { rows } = await p.query<{ lead_id: string; status: LeadStatus; expires_at: string | null }>(
    "select d.lead_id, l.status, d.expires_at from upsell_designs d join upsell_leads l on l.lead_id = d.lead_id where d.id = $1",
    [input.id],
  );
  const found = rows[0];
  /* Only a page the customer can actually see produces customer events. */
  if (!found || !VISIBLE.has(found.status)) return { recorded: false, reason: "not visible" };
  /* A link past its expiry is not a page the customer can use any more. */
  if (found.expires_at && new Date(found.expires_at).getTime() < Date.now()) return { recorded: false, reason: "expired" };

  const type = input.type as CustomerEvent;
  const slot = input.page_slot === 1 || input.page_slot === 2 ? input.page_slot : null;
  let rating: number | null = null;
  if (type === "feedback" && input.rating !== null && input.rating !== undefined) {
    const r = Math.round(Number(input.rating));
    rating = r >= 1 && r <= 5 ? r : null;
  }
  const comment = type === "feedback" && input.comment ? String(input.comment).slice(0, 1000) : null;
  if (type === "feedback" && rating === null && !comment) return { recorded: false, reason: "empty feedback" };

  await tx(async (c) => {
    await recordEvent(c, {
      lead_id: found.lead_id,
      design_id: input.id,
      type,
      actor: "customer",
      page_slot: slot,
      rating,
      comment,
      detail: input.detail ? sanitizeDetail(input.detail) : null,
      visitor_id: ctx.visitorId,
      ip_hash: hashIp(ctx.ip),
      user_agent: ctx.userAgent,
    });
    /* First look and first download move the lead along. Later statuses are
       the script's to set, from what it reads in AC2. */
    const next = type === "view" ? "viewed" : type === "download" ? "downloaded" : null;
    if (next) {
      const lead = await lockLead(c, found.lead_id);
      const may = next === "viewed" ? lead.status === "sent" : lead.status === "sent" || lead.status === "viewed";
      if (may) {
        await updateLead(c, lead.lead_id, { status: next });
        await recordStatus(c, lead.lead_id, lead.status, next, "customer");
      }
    }
  });
  return { recorded: true };
}

/** A few short scalar fields at most — this column is not a dumping ground. */
function sanitizeDetail(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d).slice(0, 8)) {
    if (!/^[a-z_]{1,32}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 120);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}
