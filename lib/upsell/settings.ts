import "server-only";

import { db, type Db } from "./db";
import { UpsellError } from "./types";

/* ==========================================================================
   upsell_settings — key/value, with the defaults written here.

   A key nobody has saved reads as its default, so a fresh database behaves
   exactly like a configured one. Keys starting with `_` are internal state
   (the Slack batching clock) and never reach the settings API or screen.
   ========================================================================== */

export const SETTING_DEFAULTS = {
  score_threshold: 6,
  control_percent: 20,
  min_products: 1,
  max_builds_per_run: 2,
  followup1_hours: 48,
  followup2_hours: 96,
  send_hour_start: 9,
  send_hour_end: 19,
  tracking_days: 30,
  install_lookback_hours: 3,
  pic: "Logan",
  review_url: "https://apps.shopify.com/pagefly#modal-show=ReviewListingModal",
  initial_message_template: "",
  build_message_mode: "manual",
  view_reminder_mode: "manual",
  view_reminder_hours: 24,
  view_reminder_template: "",
  edit_offer_mode: "manual",
  edit_offer_template: "",
  slack_webhook_url: "",
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

/** The only webhook the server will POST to: Slack's own host. */
export const SLACK_WEBHOOK = /^https:\/\/hooks\.slack\.com\/(services|workflows|triggers)\/[A-Za-z0-9/_-]+$/;

/** What the admin screen shows in place of a saved webhook URL. */
export const WEBHOOK_MASK = "••••••••";

/** Settings as the admin screen may see them: the webhook is a credential. */
export function maskSettings<T extends { slack_webhook_url: string }>(s: T): T {
  return { ...s, slack_webhook_url: s.slack_webhook_url ? WEBHOOK_MASK : "" };
}
export type Settings = { [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] extends number ? number : string };

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

export const NUMERIC_KEYS = SETTING_KEYS.filter((k) => typeof SETTING_DEFAULTS[k] === "number");

/** What each key does, for the settings screen. */
export const SETTING_HELP: Record<SettingKey, string> = {
  score_threshold: "Điểm tối thiểu để một store mới cài thành lead",
  control_percent: "Phần trăm lead vào nhóm đối chứng (không build)",
  min_products: "Số sản phẩm công khai tối thiểu",
  max_builds_per_run: "Số lead Builder nhận mỗi lần chạy",
  followup1_hours: "Giờ sau khi gửi mà chưa mở link thì soạn follow-up 1",
  followup2_hours: "Giờ sau khi gửi mà chưa tải thì soạn follow-up 2",
  send_hour_start: "Giờ địa phương của khách bắt đầu được gửi",
  send_hour_end: "Giờ địa phương của khách ngừng gửi",
  tracking_days: "Số ngày theo dõi một lead sau khi tạo",
  install_lookback_hours: "Script quét store cài trong bao nhiêu giờ gần nhất",
  pic: "Người phụ trách mặc định, điền vào {pic}",
  review_url: "Link xin review trên Shopify App Store",
  build_message_mode: "Tin nhắn build page (tin đầu tiên khi duyệt page, follow-up, xin review): manual = chờ duyệt ở tab Tin nhắn, auto = tự gửi",
  view_reminder_mode: "Tin nhắc tải khi khách đã xem mà chưa tải: manual = soạn sẵn chờ duyệt, auto = tự gửi, off = tắt",
  view_reminder_hours: "Số giờ sau lần xem đầu tiên mà khách vẫn chưa tải thì soạn tin nhắc tải",
  view_reminder_template: "Mẫu tin nhắc tải. Biến: {store_name} {link} {pic} {ttl_days} {expires_on}. Để trống dùng mẫu mặc định.",
  edit_offer_mode: "Tin chỉnh sửa miễn phí khi khách đã tải: manual = soạn sẵn chờ duyệt, auto = tự gửi, off = tắt",
  edit_offer_template: "Mẫu tin chỉnh sửa miễn phí. Biến: {store_name} {link} {pic} {edit_until}. Để trống dùng mẫu mặc định.",
  initial_message_template:
    "Mẫu tin đầu tiên. Biến: {store_name} {page1_label} {page2_label} {link} {pic}. Để trống dùng mẫu mặc định.",
  slack_webhook_url: "Slack incoming webhook. Để trống thì không báo.",
};

export async function getSettings(c?: Db): Promise<Settings> {
  const q = c ?? (await db());
  const { rows } = await q.query<{ key: string; value: unknown }>(
    "select key, value from upsell_settings where key not like '\\_%'",
  );
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const r of rows) {
    if (!Object.hasOwn(SETTING_DEFAULTS, r.key)) continue;
    const def = SETTING_DEFAULTS[r.key as SettingKey];
    out[r.key] = typeof def === "number" ? Number(r.value) : String(r.value ?? "");
    if (typeof def === "number" && !Number.isFinite(out[r.key])) out[r.key] = def;
  }
  return out as Settings;
}

/** Saves the keys given, coerced to the default's type, and only those — a
    key left out keeps what is stored. Returns what is now in force.

    NOTHING IS SKIPPED QUIETLY: an unknown key, or a number field that is
    empty or not a number, refuses the whole save (422) before anything is
    written. Skipping it would answer "saved" while the old value stayed. */
export async function saveSettings(patch: Record<string, unknown>): Promise<Settings> {
  const rows: [SettingKey, number | string][] = [];
  const bad: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    /* Own keys only: `in` would also accept "toString" and "constructor". */
    if (!Object.hasOwn(SETTING_DEFAULTS, key)) {
      bad.push(`${key} (không có setting này)`);
      continue;
    }
    const def = SETTING_DEFAULTS[key as SettingKey];
    if (key.endsWith("_mode")) {
      const v = String(raw ?? "").trim();
      if (v !== "off" && v !== "manual" && v !== "auto") bad.push(`${key} (off, manual hoặc auto)`);
      else rows.push([key as SettingKey, v]);
      continue;
    }
    if (key === "slack_webhook_url") {
      const v = String(raw ?? "").trim();
      /* The masked value the screen shows means "unchanged". */
      if (v === WEBHOOK_MASK) continue;
      /* The server POSTs to this URL, so only Slack's own webhook host: any
         other value would let an admin (or a script acting as one) aim the
         server at an internal address. */
      if (v && !SLACK_WEBHOOK.test(v)) bad.push(`${key} (phải là https://hooks.slack.com/…)`);
      else rows.push([key, v]);
      continue;
    }
    if (typeof def === "number") {
      const n = typeof raw === "string" ? (raw.trim() === "" ? NaN : Number(raw)) : typeof raw === "number" ? raw : NaN;
      if (!Number.isFinite(n)) bad.push(`${key} (phải là số)`);
      else rows.push([key as SettingKey, n]);
    } else {
      rows.push([key as SettingKey, String(raw ?? "")]);
    }
  }
  if (bad.length) throw new UpsellError(`Chưa lưu — giá trị không hợp lệ: ${bad.join(", ")}.`, 422);
  const q = await db();
  for (const [key, value] of rows) {
    await q.query(
      `insert into upsell_settings (key, value, updated_at) values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
  return getSettings(q);
}

/** Internal state, `_`-prefixed. */
export async function getInternal(key: string): Promise<unknown> {
  const q = await db();
  const { rows } = await q.query("select value from upsell_settings where key = $1", [`_${key}`]);
  return rows[0]?.value ?? null;
}

export async function setInternal(key: string, value: unknown): Promise<void> {
  const q = await db();
  await q.query(
    `insert into upsell_settings (key, value, updated_at) values ($1, $2::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [`_${key}`, JSON.stringify(value)],
  );
}
