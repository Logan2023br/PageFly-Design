import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { db } from "./db";
import { purposeKey } from "@/lib/session";
import { UpsellError } from "@/lib/upsell/types";

/* ==========================================================================
   ssu_settings — key/value with the defaults written here, like Upsell's.

   CONNECTIONS ARE CREDENTIALS. Each one is read from the environment first
   (the VPS .env), and only while that is unset from what an admin pasted on
   the Cài đặt tab — the same arrangement as Claude Build's trigger token.
   The screen only ever learns whether one is set, never its value.

   A pasted connection is ENCRYPTED in the database (AES-256-GCM, the key
   derived from SESSION_SECRET or the server's secret file, the connection's
   name bound in), so a database dump or backup does not give the tokens away.
   If that secret changes, the stored ones cannot be opened: the screen says
   "cần nhập lại" and the job treats them as unset.
   ========================================================================== */

export const SSU_DEFAULTS = {
  /** manual: drafts wait on "Chờ duyệt"; auto: eligible customers are sent at once; off: nothing is written */
  mode: "manual",
  /** the care messages after the thanks (CARE_KINDS): same three modes */
  care_mode: "manual",
  /** 1: the minute job sends nothing; approved messages wait on Chờ gửi */
  send_paused: 0,
  sender_name: "Logan",
  thanks_template: "",
  edit_reminder_template: "",
  care_read_template: "",
  care_upgraded_template: "",
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
  /** how long the free editing lasts, from the day the thanks is sent */
  edit_days: 15,
  /** read the thanks, no reply after this many hours → care_read */
  care_read_hours: 48,
  /** this many days of free editing left, seen, no reply → edit_reminder */
  edit_reminder_days_left: 5,
  /** never two messages to one customer within this many hours */
  care_gap_hours: 48,
} as const;

export type SsuKey = keyof typeof SSU_DEFAULTS;
export type SsuSettings = { [K in SsuKey]: (typeof SSU_DEFAULTS)[K] extends number ? number : string };

const VARS = "{store_name} {set_name} {pages} {page_count} {edit_days} {edit_until} {days_left} {plan} {pic} {review_url}";

export const SSU_HELP: Record<SsuKey, string> = {
  mode: "manual = tin soạn sẵn chờ bạn duyệt rồi mới gửi · auto = khách đủ điều kiện được gửi luôn · off = không soạn tin",
  send_paused: "1 = tạm dừng gửi: tin đã duyệt nằm ở Chờ gửi, không gửi cho tới khi bật lại (0)",
  care_mode: "Tin chăm sóc sau tin cảm ơn (đã đọc chưa trả lời, đã nâng cấp, nhắc còn X ngày chỉnh sửa): manual = chờ duyệt · auto = gửi luôn · off = tắt",
  sender_name: "Tên người gửi trên Crisp, điền vào {pic}",
  thanks_template: `Mẫu tin cảm ơn + chỉnh sửa miễn phí. Biến: ${VARS}. Để trống dùng mẫu mặc định.`,
  edit_reminder_template: `Mẫu tin nhắc còn X ngày chỉnh sửa (khách đã xem, chưa trả lời). Biến: ${VARS}. Để trống dùng mẫu mặc định.`,
  care_read_template: `Mẫu tin chăm sóc khi khách đã đọc mà chưa trả lời. Biến: ${VARS}. Để trống dùng mẫu mặc định.`,
  care_upgraded_template: `Mẫu tin chăm sóc khi khách nâng cấp mà chưa trả lời. Biến: ${VARS}. Để trống dùng mẫu mặc định.`,
  review_template: `Mẫu tin xin review. Biến: ${VARS}. Để trống dùng mẫu mặc định.`,
  review_url: "Link review trên Shopify App Store, điền vào {review_url}",
  auto_max_age_hours: "Chế độ auto chỉ gửi cho khách chọn template trong bấy nhiêu giờ gần nhất (không gửi dồn cho khách cũ)",
  backfill_days: "Lần đọc Mixpanel đầu tiên lấy lùi bấy nhiêu ngày",
  tracking_days: "Theo dõi khách đã gửi (đọc, phản hồi, review, nâng cấp) trong bấy nhiêu ngày",
  skip_dev_stores: "1 = không gửi cho store development / partner, 0 = vẫn gửi",
  edit_days: "Số ngày chỉnh sửa miễn phí, tính từ ngày gửi tin cảm ơn ({edit_days}, {edit_until}, {days_left})",
  care_read_hours: "Khách đã đọc tin cảm ơn mà bấy nhiêu giờ vẫn chưa trả lời thì soạn tin chăm sóc",
  edit_reminder_days_left: "Còn bấy nhiêu ngày chỉnh sửa miễn phí (khách đã xem, chưa trả lời) thì soạn tin nhắc",
  care_gap_hours: "Không gửi 2 tin cho cùng một khách trong vòng bấy nhiêu giờ",
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
  n8n_ac2_url: { env: "N8N_AC2_URL", label: "AC2 qua n8n: URL (giống BPU Ops)", fallback: "", secret: false },
  n8n_ac2_key: { env: "N8N_AC2_KEY", label: "AC2 qua n8n: key (giống BPU Ops)", fallback: "", secret: true },
} as const;

export type ConnectionKey = keyof typeof CONNECTIONS;

export type ConnectionState = {
  key: ConnectionKey;
  label: string;
  env: string;
  secret: boolean;
  from: "env" | "panel" | "default" | null;
  /** the value of a non-secret connection */
  value: string | null;
  /** a secret's last 4 characters, to tell which token is in */
  hint: string | null;
  /** stored, but cannot be decrypted with this server's key */
  broken: boolean;
};

const CONN_PREFIX = "conn:";

type Sealed = { v: 1; iv: string; tag: string; ct: string };

const connKey = () => purposeKey("ssu-connections-v1");

function seal(key: string, plain: string): Sealed {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", connKey(), iv);
  c.setAAD(Buffer.from(key));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return { v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}

/** The stored value: "" when there is none, null when it cannot be opened. */
function unseal(key: string, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return "";
  /* plain text from before encryption: still read, sealed on the next save */
  if (typeof raw === "string") return raw;
  const s = raw as Partial<Sealed>;
  if (s.v !== 1 || !s.iv || !s.tag || !s.ct) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", connKey(), Buffer.from(s.iv, "base64"));
    d.setAAD(Buffer.from(key));
    d.setAuthTag(Buffer.from(s.tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(s.ct, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

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
      /* a whole .env line pasted ("N8N_AC2_KEY=bpu_…", maybe quoted) keeps only its value */
      const envName = CONNECTIONS[key as ConnectionKey].env;
      const v = String(raw ?? "")
        .trim()
        .replace(new RegExp(`^(export\\s+)?${envName}\\s*=\\s*`), "")
        .replace(/^(["'])(.*)\1$/, "$2")
        .trim();
      if (v.length > 4000 || /\s/.test(v)) bad.push(`${key} (không hợp lệ)`);
      else rows.push([CONN_PREFIX + key, v ? seal(key, v) : ""]);
      continue;
    }
    if (!Object.hasOwn(SSU_DEFAULTS, key)) {
      bad.push(`${key} (không có setting này)`);
      continue;
    }
    const def = SSU_DEFAULTS[key as SsuKey];
    if (key === "mode" || key === "care_mode") {
      const v = String(raw ?? "").trim();
      if (v !== "off" && v !== "manual" && v !== "auto") bad.push(`${key} (off, manual hoặc auto)`);
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
  const panel = unseal(key, raw.get(CONN_PREFIX + key));
  return panel || def.fallback;
}

export async function connectionStates(): Promise<ConnectionState[]> {
  const raw = await readRaw();
  return (Object.keys(CONNECTIONS) as ConnectionKey[]).map((key) => {
    const def = CONNECTIONS[key];
    const env = process.env[def.env]?.trim();
    const panel = unseal(key, raw.get(CONN_PREFIX + key));
    const from = env ? "env" : panel ? "panel" : def.fallback ? "default" : null;
    const current = env || panel || def.fallback || "";
    return {
      key,
      label: def.label,
      env: def.env,
      secret: def.secret,
      from,
      value: def.secret ? null : current || null,
      hint: def.secret && current.length >= 8 ? `…${current.slice(-4)}` : null,
      broken: !env && panel === null,
    };
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
