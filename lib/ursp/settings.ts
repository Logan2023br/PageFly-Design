import "server-only";

import { UpsellError } from "@/lib/upsell/types";
import { db, getState, setState } from "./db";

/* ==========================================================================
   ursp_settings — key/value with the defaults written here, like the other
   upsells. Credentials are not here: Crisp and AC2 are Store set upsell's
   connections (lib/storeSetUpsell/settings), read the same way.

   Whether the workflow runs at all is not a setting but `run` in ursp_state:
   "Bắt đầu" / "Tạm dừng" on the screen. It starts paused — nothing is read
   or sent until someone presses Bắt đầu.
   ========================================================================== */

export const URSP_DEFAULTS = {
  /** manual: each message waits on Chờ duyệt; auto: sent as soon as the store qualifies */
  mode: "auto",
  sender_name: "Logan",
  /** the last day a message goes out (Vietnam time) */
  campaign_end: "2026-11-30",
  /** how long the offer lasts from the moment it is sent — {deadline} in the message */
  offer_days: 3,
  recap_template: "",
  active_template: "",
  /** the A/B test's B message — empty: the built-in B */
  recap_template_b: "",
  active_template_b: "",
  followup_template_b: "",
  /** 1: every new store that qualifies joins the A/B half with fewer stores of its segment; 0: all A */
  ab_split: 1,
  active_subject: "Free responsive check for your store pages",
  /** a store with more published pages than this gets no message */
  max_published_pages: 20,
  /** resolutions that keep a Recap row out, comma separated */
  recap_skip_resolutions: "Đợi TS check, Hết ca chưa giải quyết",
  /** 1: only Recap rows whose category_issue Haiku calls responsive; 0: every new row */
  recap_only_responsive: 0,
  /** 1: the Recap segment runs */
  recap_enabled: 1,
  /** 1: the Active segment runs */
  active_enabled: 1,
  /** AC2's store list, as query parameters ("limit=300") */
  active_ac2_query: "limit=300",
  /** the store fields that say when it was last active, first found wins */
  active_fields: "lastActiveAt, lastActivityAt, lastActive, lastLoginAt, lastSeenAt, lastOpenedAt, lastOpenAppAt, updatedAt",
  /** 1: a store that read the offer and has not replied gets one reminder */
  followup_enabled: 1,
  /** hours after it was read with no reply before the reminder */
  followup_after_hours: 24,
  followup_template: "",
  /** at most this many new Active stores looked at per hourly scan */
  active_per_scan: 40,
  /** a conversation with a message this recent: support may be mid-chat, the message waits */
  quiet_minutes: 30,
  /** how long a sent store is followed (read, reply, upgrade, review) */
  tracking_days: 45,
  /** a customer with any of these Crisp segments gets nothing from this program, comma separated */
  blocked_segments: "dev, bad-review, badreview",
  /** 1: after Đã xử lý xong, a customer who confirms it works (Haiku reads it) is thanked and asked for a review, by sender_name */
  review_ask_enabled: 1,
  /** the thank-you sent first — empty: the built-in one */
  review_thanks_template: "",
  /** the review request sent after it — empty: the built-in one */
  review_ask_template: "",
  /** added to the conversation on Crisp when the customer agrees to the offer */
  crisp_segment: "upsell-responsive",
} as const;

export type UrspKey = keyof typeof URSP_DEFAULTS;
export type UrspSettings = { [K in UrspKey]: (typeof URSP_DEFAULTS)[K] extends number ? number : string };

const VARS = "{store_name} {pic} {offer_days} {deadline} {end_date}";

export const URSP_HELP: Record<UrspKey, string> = {
  mode: "auto = store đủ điều kiện được gửi luôn · manual = tin nằm ở Chờ duyệt, bấm duyệt mới gửi",
  sender_name: "Tên người gửi trên Crisp, cũng là người được mention khi khách reply ({pic})",
  campaign_end: "Ngày cuối gửi tin (YYYY-MM-DD, giờ Việt Nam) — {end_date} trong tin",
  offer_days: "Ưu đãi có hiệu lực bấy nhiêu ngày kể từ lúc gửi — {offer_days} và {deadline} (ngày hết hạn, điền lúc gửi) trong tin. Hết hạn thì không nhắc lại",
  recap_template: `Tin cho phân khúc Recap (gửi vào chính ticket support đó). Biến: ${VARS}. Để trống dùng mẫu mặc định.`,
  active_template: `Tin cho phân khúc Active (vào hội thoại Crisp gần nhất của khách, chưa có thì mở hội thoại mới đi qua email). Biến: ${VARS}. Để trống dùng mẫu mặc định.`,
  active_subject: "Tiêu đề hội thoại / email cho phân khúc Active",
  recap_template_b: `A/B test — bản B cho phân khúc Recap. Biến: ${VARS}. Để trống dùng mẫu B mặc định.`,
  active_template_b: `A/B test — bản B cho phân khúc Active. Biến: ${VARS}. Để trống dùng mẫu B mặc định.`,
  followup_template_b: `A/B test — tin nhắc lại của bản B. Biến: ${VARS}. Để trống dùng mẫu B mặc định.`,
  ab_split: "1 = store mới vào bản (A / B) đang ít store hơn trong cùng phân khúc — B được bù cho bằng A trước, rồi chia đều; cả 2 bản đều có Recap và Active · 0 = tất cả nhận bản A",
  max_published_pages: "Store có nhiều page publish hơn số này thì không gửi",
  recap_skip_resolutions: "Resolution trong file Recap thì bỏ qua (cách nhau dấu phẩy, không phân biệt hoa thường / dấu)",
  recap_only_responsive: "0 = gửi cho mọi row Recap mới (trừ resolution bị bỏ qua) · 1 = chỉ row có category_issue là responsive (Haiku kiểm tra)",
  recap_enabled: "1 = chạy phân khúc Recap, 0 = tắt",
  active_enabled: "1 = chạy phân khúc Active, 0 = tắt",
  active_ac2_query: "Tham số đọc danh sách store của AC2 (dạng limit=300&…)",
  active_fields: "Các trường thời gian của store AC2 cho biết lần hoạt động gần nhất — trường đầu tiên có giá trị được dùng",
  followup_enabled: "1 = khách đã xem tin mà chưa trả lời thì gửi 1 tin nhắc lại (miễn phí, sắp hết hạn), 0 = tắt",
  followup_after_hours: "Đã xem bấy nhiêu giờ mà chưa trả lời thì nhắc lại",
  followup_template: `Tin nhắc lại, gửi vào cùng hội thoại. Biến: ${VARS}. Để trống dùng mẫu mặc định.`,
  active_per_scan: "Mỗi lần quét (1 tiếng) xét tối đa bấy nhiêu store Active mới",
  quiet_minutes: "Hội thoại có tin nhắn trong bấy nhiêu phút gần nhất (support đang chat) thì tin đợi, thử lại sau",
  tracking_days: "Theo dõi store đã gửi (đọc, phản hồi, nâng cấp, review) trong bấy nhiêu ngày",
  blocked_segments: "Khách có segment nào trong danh sách này (trên bất kỳ hội thoại Crisp nào) thì không gửi tin mời, không nhắc lại. Cách nhau dấu phẩy; không phân biệt hoa thường, gạch nối, dấu cách (bad-review = badreview)",
  review_ask_enabled:
    "1 = sau khi bấm Đã xử lý xong, khách reply cảm ơn / xác nhận đã ổn (Haiku đọc) thì tự gửi 2 tin dưới tên người gửi: cảm ơn, rồi xin review. Khách khó chịu / còn lỗi / muốn fix thêm thì không gửi gì, để FL reply · 0 = tắt",
  review_thanks_template: "Tin cảm ơn gửi trước. Biến: {store_name} {pic}. Để trống dùng mẫu mặc định.",
  review_ask_template: "Tin xin review gửi sau tin cảm ơn — link review viết dạng [chữ](link). Biến: {store_name} {pic}. Để trống dùng mẫu mặc định.",
  crisp_segment: "Segment gắn vào hội thoại trên Crisp khi khách reply đồng ý (Haiku đọc). Để trống: không gắn",
};

export const URSP_NUMERIC = (Object.keys(URSP_DEFAULTS) as UrspKey[]).filter((k) => typeof URSP_DEFAULTS[k] === "number");

export async function getUrspSettings(): Promise<UrspSettings> {
  const { rows } = await (await db()).query<{ key: string; value: unknown }>("select key, value from ursp_settings");
  const raw = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, unknown> = { ...URSP_DEFAULTS };
  for (const key of Object.keys(URSP_DEFAULTS) as UrspKey[]) {
    if (!raw.has(key)) continue;
    const def = URSP_DEFAULTS[key];
    const v = raw.get(key);
    if (typeof def === "number") {
      const n = Number(v);
      out[key] = Number.isFinite(n) ? n : def;
    } else out[key] = String(v ?? "");
  }
  return out as UrspSettings;
}

export async function saveUrspSettings(patch: Record<string, unknown>): Promise<UrspSettings> {
  const rows: [string, unknown][] = [];
  const bad: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (!Object.hasOwn(URSP_DEFAULTS, key)) {
      bad.push(`${key} (không có setting này)`);
      continue;
    }
    const def = URSP_DEFAULTS[key as UrspKey];
    if (key === "mode") {
      const v = String(raw ?? "").trim();
      if (v !== "manual" && v !== "auto") bad.push("mode (manual hoặc auto)");
      else rows.push([key, v]);
    } else if (key === "campaign_end") {
      const v = String(raw ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) bad.push("campaign_end (YYYY-MM-DD)");
      else rows.push([key, v]);
    } else if (typeof def === "number") {
      const n = typeof raw === "string" ? (raw.trim() === "" ? NaN : Number(raw)) : typeof raw === "number" ? raw : NaN;
      if (!Number.isFinite(n) || n < 0) bad.push(`${key} (phải là số ≥ 0)`);
      else rows.push([key, n]);
    } else rows.push([key, String(raw ?? "")]);
  }
  if (bad.length) throw new UpsellError(`Chưa lưu — giá trị không hợp lệ: ${bad.join(", ")}.`, 422);
  const q = await db();
  for (const [key, value] of rows)
    await q.query(
      `insert into ursp_settings (key, value, updated_at) values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  return getUrspSettings();
}

/* ---------------------------------------------------------------- running */

export type RunState = { on: boolean; at: string; by: string; started_at: string | null };

export async function runState(): Promise<RunState> {
  return (await getState<RunState>("run")) ?? { on: false, at: new Date(0).toISOString(), by: "", started_at: null };
}

/**
 * Bắt đầu / Tạm dừng. Starting is "from now": the Recap cursor moves to the
 * sheet's end on the next read, so rows written while it was paused — or
 * before it ever ran — are never targeted.
 */
export async function setRunning(on: boolean, by: string): Promise<RunState> {
  const now = new Date().toISOString();
  const cur = await runState();
  const next: RunState = { on, at: now, by, started_at: on ? now : cur.started_at };
  await setState("run", next);
  if (on && !cur.on) await setState("recap_cursor", null);
  return next;
}

/** The last day messages go out has passed (Vietnam time). */
export function campaignOver(cfg: UrspSettings, now = new Date()): boolean {
  const end = Date.parse(`${cfg.campaign_end}T23:59:59+07:00`);
  return Number.isFinite(end) && now.getTime() > end;
}
