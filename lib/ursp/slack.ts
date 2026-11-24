import "server-only";

import { upsellOrigin } from "@/lib/upsell/common";
import { SLACK_WEBHOOK } from "@/lib/upsell/settings";
import { connection } from "@/lib/storeSetUpsell/settings";
import { URSP_PICS, type UrspTarget } from "./types";
import type { UrspSettings } from "./settings";

/* ==========================================================================
   Slack, the moment a customer says yes (Haiku reads the reply as "agree"):
   one message to the TS channel, the TS on shift tagged, so the ticket is
   picked up at once — beside the count on the screen.

     [Responsive Ticket] · <store>
     TS: @<the TS on shift>
     Link Ticket: <the Crisp conversation>
     Link Admin:  <the Khách đồng ý tab, opened on that store's row>

   The webhook is a connection (URSP_SLACK_WEBHOOK, encrypted like the other
   credentials). Who is on shift comes from `ts_roster` (Vietnam time); each
   name's Slack member id from `slack_ts_ids`, so the tag notifies them. With
   nobody found for the hour, the sender (Logan) is tagged.
   ========================================================================== */

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** "Logan=U0123, Hew=U0456" → { logan: "U0123", … } */
export function slackIds(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of raw.split(/[,\n]/)) {
    const m = /^\s*([^=:]+?)\s*[=:]\s*([UW][A-Z0-9]{6,})\s*$/i.exec(part);
    if (m) out.set(m[1].toLowerCase(), m[2].toUpperCase());
  }
  return out;
}

/** The Vietnam weekday (0 = Sunday) and hour of a moment. */
function vnClock(at: Date): { day: number; hour: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", weekday: "short", hour: "numeric", hourCycle: "h23" })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  return { day: DAYS.indexOf(String(p.weekday).toLowerCase().slice(0, 3)), hour: Number(p.hour) };
}

function dayList(spec: string): number[] {
  const s = spec.trim().toLowerCase();
  if (s === "*" || s === "all" || s === "daily") return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set<number>();
  for (const part of s.split(/[,\s]+/).filter(Boolean)) {
    const [a, b] = part.split("-").map((d) => DAYS.indexOf(d.slice(0, 3)));
    if (a < 0) continue;
    if (b === undefined || b < 0) out.add(a);
    else for (let d = a; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === b) break;
    }
  }
  return [...out];
}

/**
 * The TS on shift at `at`, from the roster — one line per shift, Vietnam time:
 *   Mon 08-11: Logan, Hew
 *   Tue-Fri 14-17: Hew
 *   * 23-02: Aasim          (past midnight: the hours after 0 belong to the next day)
 * Names outside the TS list are ignored (a roster copied whole keeps working).
 */
export function tsOnShift(roster: string, at = new Date()): string[] {
  const { day, hour } = vnClock(at);
  const ts = new Map<string, string>(URSP_PICS.map((p) => [p.toLowerCase(), p]));
  /* the schedule shows the owner's own shifts as "You" — that is Logan */
  ts.set("you", "Logan");
  const found: string[] = [];
  for (const line of roster.split("\n")) {
    const m = /^\s*([a-z*,\s-]+?)\s+(\d{1,2})(?::\d{2})?\s*-\s*(\d{1,2})(?::\d{2})?\s*:\s*(.+)$/i.exec(line);
    if (!m) continue;
    const days = dayList(m[1]);
    const from = Number(m[2]) % 24;
    const to = Number(m[3]) % 24;
    const inside =
      from < to
        ? days.includes(day) && hour >= from && hour < to
        : /* past midnight */ (days.includes(day) && hour >= from) || (days.includes((day + 6) % 7) && hour < to);
    if (!inside) continue;
    for (const n of m[4].split(/[,;/]/)) {
      const name = ts.get(n.trim().replace(/\s*\(.*\)$/, "").toLowerCase());
      if (name && !found.includes(name)) found.push(name);
    }
  }
  return found;
}

export const adminRowUrl = (t: Pick<UrspTarget, "store_domain">) =>
  `${upsellOrigin()}/design/admin/responsive?tab=agreed&q=${encodeURIComponent(t.store_domain)}`;

/** Slack's link text must not break its <url|text> syntax. */
const esc = (s: string) => s.replace(/[<>|&]/g, (c) => ({ "<": "‹", ">": "›", "|": "¦", "&": "and" })[c]!);

/**
 * The yes to Slack. Resolves to who was tagged, or null when nothing was sent
 * (no webhook configured — not an error: the screen still counts it).
 */
export async function slackAgree(t: UrspTarget, cfg: UrspSettings, at = new Date()): Promise<{ tagged: string[] } | null> {
  const hook = (await connection("ursp_slack_webhook")).trim();
  if (!hook) return null;
  if (!SLACK_WEBHOOK.test(hook)) throw new Error("URSP_SLACK_WEBHOOK phải là https://hooks.slack.com/…");
  const onShift = tsOnShift(cfg.ts_roster, at);
  const tagged = onShift.length ? onShift : [cfg.sender_name];
  const ids = slackIds(cfg.slack_ts_ids);
  const who = tagged.map((n) => (ids.get(n.toLowerCase()) ? `<@${ids.get(n.toLowerCase())}>` : `@${n}`)).join(" ");
  const store = esc(t.store_name?.trim() || t.store_domain.replace(/\.myshopify\.com$/, ""));
  const ticket = t.ticket_link ? `<${t.ticket_link}|Mở ticket Crisp>` : "—";
  const text =
    `*[Responsive Ticket]* · ${store}\n` +
    `*TS:* ${who}\n` +
    `*Link Ticket:* ${ticket}\n` +
    `*Link Admin:* <${adminRowUrl(t)}|Mở trong admin (Khách đồng ý)>`;
  const res = await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
    /* Slack answers directly; a redirect would be somewhere else */
    redirect: "error",
  });
  if (!res.ok) throw new Error(`Slack ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}`);
  return { tagged };
}
