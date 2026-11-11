import "server-only";

import type { AdminSection } from "@/lib/adminSections";
import { endedJobs } from "@/lib/claudeBuild";
import { db as upsellDb, hasUpsellDatabase } from "@/lib/upsell/db";

/* ==========================================================================
   What the admin hears: the moments worth a sound, from the last 48 hours.

   An upgrade's time comes from AC2's charge, which can be earlier than the
   minute it was noticed — so this answers a window, not "since", and the
   browser remembers which ids it has already announced. A reply's id carries
   its time, so the next reply from the same store is news again.
   ========================================================================== */

export type AdminNotice = {
  id: string;
  at: string;
  tone: "celebrate" | "done" | "error" | "reply";
  text: string;
  /** shown on the card, never read out: a customer's words are theirs */
  detail?: string;
  /** where the bell's list opens it */
  href?: string;
};

const bpuHref = (leadId: string) => `/design/admin/upsell/leads/${encodeURIComponent(leadId)}`;
const ssuHref = (domain: string) => `/design/admin/collections/upsell?tab=all&q=${encodeURIComponent(domain)}`;
const urspHref = (tab: string, domain: string) => `/design/admin/responsive?tab=${tab}&q=${encodeURIComponent(domain)}`;

const WINDOW_HOURS = 48;

const store = (name: string | null, domain: string) => name?.trim() || domain.replace(/\.myshopify\.com$/, "");

type ReplyRow = { store_domain: string; store_name: string | null; last_reply_at: Date | string; last_reply_text: string | null; lead_id?: string };

function reply(key: "bpu" | "ssu", where: string, r: ReplyRow): AdminNotice {
  const at = new Date(r.last_reply_at).toISOString();
  const said = r.last_reply_text?.replace(/\s+/g, " ").trim();
  return {
    id: `${key}-reply:${r.store_domain}:${at}`,
    at,
    tone: "reply",
    text: `${where}: khách ${store(r.store_name, r.store_domain)} vừa phản hồi tin nhắn.`,
    detail: said ? (said.length > 160 ? `${said.slice(0, 160)}…` : said) : undefined,
    href: key === "bpu" && r.lead_id ? bpuHref(r.lead_id) : ssuHref(r.store_domain),
  };
}

export async function recentNotices(sections: AdminSection[]): Promise<AdminNotice[]> {
  const out: AdminNotice[] = [];
  const reads: Promise<void>[] = [];
  if (sections.includes("upsell") && hasUpsellDatabase()) {
    reads.push(
      (async () => {
        const { rows } = await (await upsellDb()).query(
          `select lead_id, store_domain, store_name, upgraded_to, upgraded_at from upsell_leads
            where upgraded and upgraded_at > now() - make_interval(hours => $1)`,
          [WINDOW_HOURS],
        );
        for (const r of rows)
          out.push({
            id: `bpu:${r.store_domain}`,
            at: new Date(r.upgraded_at).toISOString(),
            tone: "celebrate",
            href: bpuHref(r.lead_id),
            text: `Xin chúc mừng! Build 2 page có user upgrade mới: ${store(r.store_name, r.store_domain)}${r.upgraded_to ? `, lên gói ${r.upgraded_to}` : ""}.`,
          });
      })(),
    );
    reads.push(
      (async () => {
        const { rows } = await (await upsellDb()).query(
          `select lead_id, store_domain, store_name, last_reply_at, last_reply_text from upsell_leads
            where replied and last_reply_at > now() - make_interval(hours => $1)`,
          [WINDOW_HOURS],
        );
        for (const r of rows) out.push(reply("bpu", "Build 2 page", r));
      })(),
    );
  }
  if (sections.includes("ssu")) {
    if (hasUpsellDatabase())
      reads.push(
        (async () => {
          const { rows } = await (await upsellDb()).query(
            `select store_domain, store_name, upgraded_to, upgraded_at from ssu_customers
              where upgraded_at > now() - make_interval(hours => $1)`,
            [WINDOW_HOURS],
          );
          for (const r of rows)
            out.push({
              id: `ssu:${r.store_domain}`,
              at: new Date(r.upgraded_at).toISOString(),
              tone: "celebrate",
              href: ssuHref(r.store_domain),
              text: `Xin chúc mừng! Upsell Collection Pages có user upgrade mới: ${store(r.store_name, r.store_domain)}${r.upgraded_to ? `, lên gói ${r.upgraded_to}` : ""}.`,
            });
        })(),
      );
    if (hasUpsellDatabase())
      reads.push(
        (async () => {
          const { rows } = await (await upsellDb()).query(
            `select store_domain, store_name, last_reply_at, last_reply_text from ssu_customers
              where replied and last_reply_at > now() - make_interval(hours => $1)`,
            [WINDOW_HOURS],
          );
          for (const r of rows) out.push(reply("ssu", "Upsell Collection Pages", r));
        })(),
      );
  }
  if (sections.includes("collections")) {
    reads.push(
      (async () => {
        for (const j of await endedJobs(WINDOW_HOURS))
          out.push({
            id: `cb:${j.id}:${j.status}`,
            at: j.finishedAt,
            tone: j.status === "done" ? "done" : "error",
            href: "/design/admin/collections",
            text:
              j.status === "done"
                ? `Claude Build đã build xong bộ ${j.setName ?? "mới"}, ${j.pages} page.`
                : `Claude Build báo lỗi${j.setName ? ` ở bộ ${j.setName}` : ""}.`,
          });
      })(),
    );
  }
  if (sections.includes("ursp") && hasUpsellDatabase()) {
    reads.push(
      (async () => {
        const { rows } = await (await upsellDb()).query(
          `select store_domain, store_name, segment, variant, last_reply_at, last_reply_text, reply_intent, classified_at, upgraded_at, upgraded_to, reviewed_at, app_review,
                  review_ask_status, review_asked_at, review_asked_by, review_ask_where
             from ursp_targets
            where last_reply_at > now() - make_interval(hours => $1)
               or upgraded_at > now() - make_interval(hours => $1)
               or reviewed_at > now() - make_interval(hours => $1)
               or (review_ask_status = 'sent' and review_asked_at > now() - make_interval(hours => $1))`,
          [WINDOW_HOURS],
        );
        const since = Date.now() - WINDOW_HOURS * 3_600_000;
        const recent = (t: Date | string | null) => !!t && new Date(t).getTime() > since;
        for (const r of rows) {
          const who = `${store(r.store_name, r.store_domain)}${r.variant ? ` (bản ${r.variant})` : ""}`;
          if (recent(r.last_reply_at)) {
            const at = new Date(r.last_reply_at).toISOString();
            const said = r.last_reply_text?.replace(/\s+/g, " ").trim();
            out.push({
              id: `ursp-reply:${r.store_domain}:${at}`,
              at,
              tone: "reply",
              text: `Upsell Responsive: khách ${who} vừa phản hồi tin nhắn.`,
              detail: said ? (said.length > 160 ? `${said.slice(0, 160)}…` : said) : undefined,
              href: urspHref("sent", r.store_domain),
            });
          }
          /* Haiku read it as a yes: the moment to act */
          if (r.reply_intent === "agree" && recent(r.classified_at))
            out.push({
              id: `ursp-agree:${r.store_domain}`,
              at: new Date(r.classified_at).toISOString(),
              tone: "celebrate",
              text: `Upsell Responsive: khách ${who} đồng ý review responsive — xử lý ngay!`,
              href: urspHref("sent", r.store_domain),
            });
          if (recent(r.upgraded_at))
            out.push({
              id: `ursp-up:${r.store_domain}`,
              at: new Date(r.upgraded_at).toISOString(),
              tone: "celebrate",
              text: `Xin chúc mừng! Upsell Responsive có user upgrade mới: ${who}${r.upgraded_to ? `, lên gói ${r.upgraded_to}` : ""}.`,
              href: urspHref("sent", r.store_domain),
            });
          if (recent(r.reviewed_at))
            out.push({
              id: `ursp-review:${r.store_domain}`,
              at: new Date(r.reviewed_at).toISOString(),
              tone: "celebrate",
              text: `Upsell Responsive: khách ${who} vừa review ${r.app_review ?? 5}★.`,
              href: urspHref("sent", r.store_domain),
            });
          /* the bot (or someone, by hand) thanked them and asked for a review */
          if (r.review_ask_status === "sent" && recent(r.review_asked_at))
            out.push({
              id: `ursp-askreview:${r.store_domain}`,
              at: new Date(r.review_asked_at).toISOString(),
              tone: "done",
              text: `Upsell Responsive: ${r.review_asked_by === "system" ? "bot " : ""}vừa gửi xin ${
                r.review_ask_where === "trustpilot" ? "review Trustpilot" : r.review_ask_where === "shopify" ? "app review" : "lời cảm ơn (không xin review)"
              } đối với store ${who}.`,
              href: urspHref("done", r.store_domain),
            });
        }
      })(),
    );
  }
  /* A source that is down (no table yet, no database) just says nothing. */
  await Promise.allSettled(reads);
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
