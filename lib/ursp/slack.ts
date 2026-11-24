import "server-only";

import { upsellOrigin } from "@/lib/upsell/common";
import { UpsellError } from "@/lib/upsell/types";
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

   Sent by the bot (URSP_SLACK_BOT_TOKEN — BBBot's token, chat:write, to
   `slack_channel`), or else an incoming webhook (URSP_SLACK_WEBHOOK); both
   are connections, encrypted like the other credentials. With the bot, each
   TS's member id is found by name (users:read) unless slack_ts_ids says. Who is on shift comes from `ts_roster` (Vietnam time); each
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

/* ---- the bot (BBBot's token): post to a channel, find the TS by name ---- */

type SlackUser = { id: string; deleted?: boolean; is_bot?: boolean; name?: string; real_name?: string; profile?: { display_name?: string; real_name?: string } };

async function slackApi<T>(token: string, method: string, body?: Record<string, unknown>, query = ""): Promise<T> {
  const res = await fetch(`https://slack.com/api/${method}${query}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  const j = (await res.json().catch(() => ({ ok: false, error: `http ${res.status}` }))) as T & { ok: boolean; error?: string; needed?: string };
  if (!j.ok) throw new Error(`Slack ${method}: ${j.error ?? "lỗi"}${j.needed ? ` (token cần quyền ${j.needed})` : ""}`);
  return j;
}

let people: { at: number; users: SlackUser[] } | null = null;

/** Every member, read at most every 6 hours (users:read). */
async function members(token: string): Promise<SlackUser[]> {
  if (people && Date.now() - people.at < 6 * 3_600_000) return people.users;
  const users: SlackUser[] = [];
  let cursor = "";
  for (let i = 0; i < 20; i++) {
    const r = await slackApi<{ members: SlackUser[]; response_metadata?: { next_cursor?: string } }>(token, "users.list", undefined, `?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    users.push(...r.members.filter((u) => !u.deleted && !u.is_bot));
    cursor = r.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  people = { at: Date.now(), users };
  return users;
}

/** A TS's member id by their name: "Nguyễn Trung Hiếu (Hew)", display name "Hew", or a name that starts with it. */
function findMember(users: SlackUser[], ts: string): string | null {
  const want = ts.toLowerCase();
  const names = (u: SlackUser) => [u.profile?.display_name, u.profile?.real_name, u.real_name, u.name].filter(Boolean).map((x) => x!.toLowerCase());
  const exact = users.filter((u) => names(u).some((n) => n === want || n.includes(`(${want})`)));
  if (exact.length === 1) return exact[0].id;
  const first = users.filter((u) => names(u).some((n) => n.split(/[\s.(]+/)[0] === want));
  return first.length === 1 ? first[0].id : null;
}

/**
 * The yes to Slack. Resolves to who was tagged, or null when nothing was sent
 * (no bot token or webhook configured — not an error: the screen still counts it).
 */
export async function slackAgree(t: UrspTarget, cfg: UrspSettings, at = new Date(), test = false): Promise<{ tagged: string[]; missing: string[] } | null> {
  const token = (await connection("ursp_slack_bot_token")).trim();
  const hook = (await connection("ursp_slack_webhook")).trim();
  if (!token && !hook) return null;
  if (token && !cfg.slack_channel.trim()) throw new Error("Chưa đặt slack_channel (ID kênh Slack) trong Cài đặt");
  if (!token && !SLACK_WEBHOOK.test(hook)) throw new Error("URSP_SLACK_WEBHOOK phải là https://hooks.slack.com/…");
  const onShift = tsOnShift(cfg.ts_roster, at);
  /* Who handles responsive cases: the TS with an id in slack_ts_ids — a TS
     left out of it is not on these cases. With no ids typed in at all, every
     TS counts and the bot finds them by name. */
  const ids = slackIds(cfg.slack_ts_ids);
  const typed = ids.size > 0;
  const users = !typed && token ? await members(token).catch(() => [] as SlackUser[]) : [];
  const idOf = (n: string) => ids.get(n.toLowerCase()) ?? (typed ? null : findMember(users, n));
  const inCharge = onShift.filter((n) => idOf(n));
  /* the TS on shift who are left out (no id) — said on the test, never tagged */
  const missing = onShift.filter((n) => !idOf(n));
  /* one person per case: two in charge on the shift take turns; nobody: the sender */
  let pick: string | null;
  if (inCharge.length > 1) {
    const { getState, setState } = await import("./db");
    const turn = Number((await getState<number>("slack_turn")) ?? 0) || 0;
    pick = inCharge[turn % inCharge.length];
    if (!test) await setState("slack_turn", turn + 1);
  } else pick = inCharge[0] ?? (idOf(cfg.sender_name) ? cfg.sender_name : null);
  const tagged = pick ? [pick] : [];
  const who = pick ? `<@${idOf(pick)}>` : "_(chưa có TS nào trong ca có Slack ID)_";
  const store = esc(t.store_name?.trim() || t.store_domain.replace(/\.myshopify\.com$/, ""));
  const ticket = t.ticket_link ? `<${t.ticket_link}|Mở ticket Crisp>` : "—";
  const text =
    `*[Responsive Ticket]* · ${store}${test ? " _(gửi thử — không cần xử lý)_" : ""}\n` +
    `*TS:* ${who}\n` +
    `*Link Ticket:* ${ticket}\n` +
    `*Link Admin:* <${adminRowUrl(t)}|Mở trong admin (Khách đồng ý)>`;
  if (token) {
    await slackApi(token, "chat.postMessage", { channel: cfg.slack_channel.trim().replace(/^#/, ""), text, unfurl_links: false, unfurl_media: false });
    return { tagged, missing };
  }
  const res = await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10_000),
    /* Slack answers directly; a redirect would be somewhere else */
    redirect: "error",
  });
  if (!res.ok) throw new Error(`Slack ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}`);
  return { tagged, missing };
}

/**
 * "Gửi thử" on the settings tab: the same message, now, for the latest case on
 * Khách đồng ý (its real store, ticket and admin link) — marked as a test, and
 * the case itself untouched (slack_at stays as it was). No such case: a made-up store.
 */
export async function slackTest(cfg: UrspSettings): Promise<{ tagged: string[]; missing: string[]; store: string }> {
  const { db } = await import("./db");
  const { TAB_SQL } = await import("./queries");
  const real = (await (await db()).query<UrspTarget>(`select * from ursp_targets t where ${TAB_SQL.agreed} order by t.last_reply_at desc nulls last limit 1`)).rows[0];
  const t =
    real ??
    ({ store_domain: "test-store.myshopify.com", store_name: "TEST — gửi thử từ Upsell Responsive", ticket_link: null } as unknown as UrspTarget);
  let sent: { tagged: string[]; missing: string[] } | null;
  try {
    sent = await slackAgree(t, cfg, new Date(), true);
  } catch (err) {
    /* say whose token it is (auth.test: the bot's name and workspace, never the token), so a wrong token or a bot not in the channel is plain */
    const token = (await connection("ursp_slack_bot_token")).trim();
    const me = token
      ? await slackApi<{ user?: string; user_id?: string; team?: string; bot_id?: string }>(token, "auth.test").catch((e) => ({ user: undefined, team: undefined, error: String(e) }))
      : null;
    const whose = me?.user ? ` — token này là của bot "${me.user}" (workspace ${me.team ?? "?"}); bot đó phải có trong kênh: /invite @${me.user}` : "";
    throw new UpsellError(`${err instanceof Error ? err.message : String(err)}${whose}`, 502);
  }
  if (!sent) throw new UpsellError("Chưa có Slack bot token (URSP_SLACK_BOT_TOKEN trong .env của VPS) — chưa gửi được", 409);
  return { ...sent, store: t.store_name || t.store_domain };
}
