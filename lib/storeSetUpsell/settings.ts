import "server-only";

import { db } from "./db";
import { UpsellError } from "@/lib/upsell/types";

/* ==========================================================================
   ssu_settings — key/value with the defaults written here, like Upsell's.

   CONNECTIONS ARE CREDENTIALS. Each one is read from the environment first
   (the VPS .env), and only while that is unset from what an admin pasted on
   the Cài đặt tab — the same arrangement as Claude Build's trigger token.
   The screen only ever learns whether one is set, never its value.
   ========================================================================== */

export const SSU_DEFAULTS = {
  /** manual: drafts wait on "Chờ duyệt"; auto: eligible customers are sent at once; off: nothing is written */
  mode: "manual",
  sender_name: "Logan",
  thanks_template: "",
  review_template: "",
  review_url: "https://apps.shopify.com/pagefly#modal-show=ReviewListingModal",
  /** auto mode writes only for a select this recent — never for the backlog */
  auto_max_age_hours: 72,
  /** how far back the very first Mixpanel read goes */
  backfill_days: 7,
  /** how long a sent customer is followed on Crisp and AC2 */
  tracking_days: 30,
  /** 1: development / partner stores get no message */
  skip_dev_stores: 1,
  /** how long the free editing lasts, for {edit_until} */
  edit_days: 15,
} as const;

export type SsuKey = keyof typeof SSU_DEFAULTS;
export type SsuSettings = { [K in SsuKey]: (typeof SSU_DEFAULTS)[K] extends number ? number : string };

export const SSU_HELP: Record<SsuKey, string> = {
  mode: "manual = tin soạn sẵn chờ bạn duyệt rồi mới gửi · auto = khách đủ điều kiện được gửi luôn · off = không soạn tin",
  sender_name: "Tên người gửi trên Crisp, điền vào {pic}",
  thanks_template: "Mẫu tin cảm ơn + chỉnh sửa miễn phí. Biến: {store_name} {set_name} {pic} {edit_until}. Để trống dùng mẫu mặc định.",
  review_template: "Mẫu tin xin review. Biến: {store_name} {set_name} {pic} {review_url}. Để trống dùng mẫu mặc định.",
  review_url: "Link review trên Shopify App Store, điền vào {review_url}",
  auto_max_age_hours: "Chế độ auto chỉ gửi cho khách chọn template trong bấy nhiêu giờ gần nhất (không gửi dồn cho khách cũ)",
  backfill_days: "Lần đọc Mixpanel đầu tiên lấy lùi bấy nhiêu ngày",
  tracking_days: "Theo dõi khách đã gửi (đọc, phản hồi, review, nâng cấp) trong bấy nhiêu ngày",
  skip_dev_stores: "1 = không gửi cho store development / partner, 0 = vẫn gửi",
  edit_days: "Số ngày chỉnh sửa miễn phí, điền vào {edit_until}",
};

export const SSU_NUMERIC = (Object.keys(SSU_DEFAULTS) as SsuKey[]).filter((k) => typeof SSU_DEFAULTS[k] === "number");

/* ---------------------------------------------------------------- connections */

export const CONNECTIONS = {
  mixpanel_project_id: { env: "MIXPANEL_PROJECT_ID", label: "Mixpanel project id", fallback: "3429567", secret: false },
  mixpanel_username: { env: "MIXPANEL_SERVICE_ACCOUNT_USERNAME", label: "Mixpanel service account username", fallback: "", secret: false },
  mixpanel_secret: { env: "MIXPANEL_SERVICE_ACCOUNT_SECRET", label: "Mixpanel service account secret (hoặc API secret của project)", fallback: "", secret: true },
  crisp_website_id: { env: "CRISP_WEBSITE_ID", label: "Crisp website id", fallback: "7cd1799e-e8eb-476e-8cb7-33778fc41c2a", secret: false },
  crisp_identifier: { env: "CRISP_IDENTIFIER", label: "Crisp plugin identifier (giống BPU Ops)", fallback: "", secret: true },
  crisp_key: { env: "CRISP_KEY", label: "Crisp plugin key (giống BPU Ops)", fallback: "", secret: true },
  ac2_token: { env: "AC2_TOKEN", label: "AC2 token (giống BPU Ops)", fallback: "", secret: true },
} as const;

export type ConnectionKey = keyof typeof CONNECTIONS;

export type ConnectionState = { key: ConnectionKey; label: string; from: "env" | "panel" | "default" | null; value: string | null };

const CONN_PREFIX = "conn:";

async function readRaw(): Promise<Map<string, unknown>> {
  const q = await db();
  const { rows } = await q.query<{ key: string; value: unknown }>("select key, value from ssu_settings");
  return new Map(rows.map((r) => [r.key, r.value]));
}

export async function getSsuSettings(): Promise<SsuSettings> {
  const raw = await readRaw();
  const out: Record<string, unknown> = { ...SSU_DEFAULTS };
  for (const key of Object.keys(SSU_DEFAULTS) as SsuKey[]) {
    if (!raw.has(key)) continue;
    const def = SSU_DEFAULTS[key];
    const v = raw.get(key);
    if (typeof def === "number") {
      const n = Number(v);
      out[key] = Number.isFinite(n) ? n : def;
    } else out[key] = String(v ?? "");
  }
  return out as SsuSettings;
}

export async function saveSsuSettings(patch: Record<string, unknown>): Promise<SsuSettings> {
  const rows: [string, unknown][] = [];
  const bad: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (Object.hasOwn(CONNECTIONS, key)) {
      const v = String(raw ?? "").trim();
      if (v.length > 4000 || /\s/.test(v)) bad.push(`${key} (không hợp lệ)`);
      else rows.push([CONN_PREFIX + key, v]);
      continue;
    }
    if (!Object.hasOwn(SSU_DEFAULTS, key)) {
      bad.push(`${key} (không có setting này)`);
      continue;
    }
    const def = SSU_DEFAULTS[key as SsuKey];
    if (key === "mode") {
      const v = String(raw ?? "").trim();
      if (v !== "off" && v !== "manual" && v !== "auto") bad.push("mode (off, manual hoặc auto)");
      else rows.push([key, v]);
    } else if (typeof def === "number") {
      const n = typeof raw === "string" ? (raw.trim() === "" ? NaN : Number(raw)) : typeof raw === "number" ? raw : NaN;
      if (!Number.isFinite(n) || n < 0) bad.push(`${key} (phải là số ≥ 0)`);
      else rows.push([key, n]);
    } else rows.push([key, String(raw ?? "")]);
  }
  if (bad.length) throw new UpsellError(`Chưa lưu — giá trị không hợp lệ: ${bad.join(", ")}.`, 422);
  const q = await db();
  for (const [key, value] of rows) {
    if (key.startsWith(CONN_PREFIX) && value === "") {
      await q.query("delete from ssu_settings where key = $1", [key]);
      continue;
    }
    await q.query(
      `insert into ssu_settings (key, value, updated_at) values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
  return getSsuSettings();
}

/** A connection's value: the environment's, else the panel's, else its default. */
export async function connection(key: ConnectionKey): Promise<string> {
  const def = CONNECTIONS[key];
  const env = process.env[def.env]?.trim();
  if (env) return env;
  const raw = await readRaw();
  const panel = raw.get(CONN_PREFIX + key);
  if (typeof panel === "string" && panel) return panel;
  return def.fallback;
}

export async function connectionStates(): Promise<ConnectionState[]> {
  const raw = await readRaw();
  return (Object.keys(CONNECTIONS) as ConnectionKey[]).map((key) => {
    const def = CONNECTIONS[key];
    const env = process.env[def.env]?.trim();
    const panel = raw.get(CONN_PREFIX + key);
    const from = env ? "env" : typeof panel === "string" && panel ? "panel" : def.fallback ? "default" : null;
    const value = def.secret ? null : env || (typeof panel === "string" && panel) || def.fallback || null;
    return { key, label: `${def.label} · ${def.env}`, from, value };
  });
}

/* ---------------------------------------------------------------- internal state */

export async function getInternal<T>(key: string): Promise<T | null> {
  const q = await db();
  const { rows } = await q.query("select value from ssu_settings where key = $1", [`_${key}`]);
  return (rows[0]?.value as T) ?? null;
}

export async function setInternal(key: string, value: unknown): Promise<void> {
  const q = await db();
  await q.query(
    `insert into ssu_settings (key, value, updated_at) values ($1, $2::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [`_${key}`, JSON.stringify(value)],
  );
}
