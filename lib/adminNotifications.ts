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
};

const WINDOW_HOURS = 48;

const store = (name: string | null, domain: string) => name?.trim() || domain.replace(/\.myshopify\.com$/, "");

type ReplyRow = { store_domain: string; store_name: string | null; last_reply_at: Date | string; last_reply_text: string | null };

function reply(key: string, where: string, r: ReplyRow): AdminNotice {
  const at = new Date(r.last_reply_at).toISOString();
  const said = r.last_reply_text?.replace(/\s+/g, " ").trim();
  return {
    id: `${key}-reply:${r.store_domain}:${at}`,
    at,
    tone: "reply",
    text: `${where}: khách ${store(r.store_name, r.store_domain)} vừa phản hồi tin nhắn.`,
    detail: said ? (said.length > 160 ? `${said.slice(0, 160)}…` : said) : undefined,
  };
}

export async function recentNotices(sections: AdminSection[]): Promise<AdminNotice[]> {
  const out: AdminNotice[] = [];
  const reads: Promise<void>[] = [];
  if (sections.includes("upsell") && hasUpsellDatabase()) {
    reads.push(
      (async () => {
        const { rows } = await (await upsellDb()).query(
          `select store_domain, store_name, upgraded_to, upgraded_at from upsell_leads
            where upgraded and upgraded_at > now() - make_interval(hours => $1)`,
          [WINDOW_HOURS],
        );
        for (const r of rows)
          out.push({
            id: `bpu:${r.store_domain}`,
            at: new Date(r.upgraded_at).toISOString(),
            tone: "celebrate",
            text: `Xin chúc mừng! Build 2 page có user upgrade mới: ${store(r.store_name, r.store_domain)}${r.upgraded_to ? `, lên gói ${r.upgraded_to}` : ""}.`,
          });
      })(),
    );
    reads.push(
      (async () => {
        const { rows } = await (await upsellDb()).query(
          `select store_domain, store_name, last_reply_at, last_reply_text from upsell_leads
            where replied and last_reply_at > now() - make_interval(hours => $1)`,
          [WINDOW_HOURS],
        );
        for (const r of rows) out.push(reply("bpu", "Build 2 page", r));
      })(),
    );
  }
  if (sections.includes("collections")) {
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
              text: `Xin chúc mừng! Store set upsell có user upgrade mới: ${store(r.store_name, r.store_domain)}${r.upgraded_to ? `, lên gói ${r.upgraded_to}` : ""}.`,
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
          for (const r of rows) out.push(reply("ssu", "Store set upsell", r));
        })(),
      );
    reads.push(
      (async () => {
        for (const j of await endedJobs(WINDOW_HOURS))
          out.push({
            id: `cb:${j.id}:${j.status}`,
            at: j.finishedAt,
            tone: j.status === "done" ? "done" : "error",
            text:
              j.status === "done"
                ? `Claude Build đã build xong bộ ${j.setName ?? "mới"}, ${j.pages} page.`
                : `Claude Build báo lỗi${j.setName ? ` ở bộ ${j.setName}` : ""}.`,
          });
      })(),
    );
  }
  /* A source that is down (no table yet, no database) just says nothing. */
  await Promise.allSettled(reads);
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
