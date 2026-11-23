import "server-only";

import { UpsellError } from "@/lib/upsell/types";
import { db, getState, setState } from "./db";

/* ==========================================================================
   rso_settings — key/value with the defaults written here, like the other
   upsells. Whether the workflow runs is `run` in rso_state: Bắt đầu / Tạm
   dừng on the screen. It starts paused.
   ========================================================================== */

export const RSO_DEFAULTS = {
  /** manual: every message (heads-up and review request) waits on Chờ duyệt; auto: sent as soon as it is ready */
  mode: "manual",
  sender_name: "Logan",
  /** the AC2 username written as Who on the Radar row */
  ac2_assignee: "tutnb",
  /** at most this many new stores taken per scan (largest traffic first) */
  max_per_scan: 30,
  /** a store whose out-of-stock pages get fewer visits a month than this is left out */
  min_visits: 50,
  /** days after the heads-up before checking whether the store restocked */
  check_after_days: 7,
  /** days after the review request before the case closes without a review */
  review_wait_days: 21,
  /** a store is taken again only after this many days */
  cooldown_days: 60,
  /** a conversation with a message this recent: support may be mid-chat, the message waits */
  quiet_minutes: 30,
  /** a customer with any of these Crisp segments gets nothing, comma separated */
  blocked_segments: "dev, bad-review, badreview",
  /** subject of a new conversation (a store with no conversation yet: it reaches them by email) */
  subject: "A product on your PageFly page is out of stock",
  notify_template: "",
  review_template: "",
} as const;

export type RsoKey = keyof typeof RSO_DEFAULTS;
export type RsoSettings = { [K in RsoKey]: (typeof RSO_DEFAULTS)[K] extends number ? number : string };

const VARS = "{store_name} {pic} {products} {pages} {visits} {page_link}";

export const RSO_HELP: Record<RsoKey, string> = {
  mode: "manual = tin nằm ở Chờ duyệt, bấm Duyệt & gửi · auto = gửi luôn khi đủ điều kiện (cả tin báo hết hàng và tin xin review)",
  sender_name: "Tên người gửi trên Crisp ({pic})",
  ac2_assignee: "Username AC2 cho cột Who trên Radar (chưa ghi được: n8n chỉ đọc AC2) — store đã có người khác nhận trên Radar thì bỏ qua",
  max_per_scan: "Mỗi lần quét (1 tiếng) lấy tối đa bấy nhiêu store mới, lượt xem cao trước",
  min_visits: "Store có tổng lượt xem/tháng của các page hết hàng dưới số này thì bỏ qua",
  check_after_days: "Gửi xong bấy nhiêu ngày thì kiểm tra store đã nhập hàng chưa",
  review_wait_days: "Xin review xong bấy nhiêu ngày không thấy review thì đóng",
  cooldown_days: "Store đã xử lý thì sau bấy nhiêu ngày mới được lấy lại",
  quiet_minutes: "Hội thoại có tin nhắn trong bấy nhiêu phút gần nhất (support đang chat) thì tin đợi, thử lại sau",
  blocked_segments: "Khách có segment nào trong danh sách này trên Crisp thì không gửi gì. Cách nhau dấu phẩy",
  subject: "Tiêu đề hội thoại / email khi store chưa có hội thoại Crisp",
  notify_template: `Tin báo hết hàng. Biến: ${VARS}. Để trống dùng mẫu mặc định (tự viết theo số page / sản phẩm).`,
  review_template: "Tin xin review sau khi store nhập hàng. Biến: {store_name} {pic} {products} {review_link}. Để trống dùng mẫu mặc định.",
};

export const RSO_NUMERIC = (Object.keys(RSO_DEFAULTS) as RsoKey[]).filter((k) => typeof RSO_DEFAULTS[k] === "number");

export async function getRsoSettings(): Promise<RsoSettings> {
  const { rows } = await (await db()).query<{ key: string; value: unknown }>("select key, value from rso_settings");
  const raw = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, unknown> = { ...RSO_DEFAULTS };
  for (const key of Object.keys(RSO_DEFAULTS) as RsoKey[]) {
    if (!raw.has(key)) continue;
    const def = RSO_DEFAULTS[key];
    const v = raw.get(key);
    if (typeof def === "number") {
      const n = Number(v);
      out[key] = Number.isFinite(n) ? n : def;
    } else out[key] = String(v ?? "");
  }
  return out as RsoSettings;
}

export async function saveRsoSettings(patch: Record<string, unknown>): Promise<RsoSettings> {
  const rows: [string, unknown][] = [];
  const bad: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (!Object.hasOwn(RSO_DEFAULTS, key)) {
      bad.push(`${key} (không có setting này)`);
      continue;
    }
    const def = RSO_DEFAULTS[key as RsoKey];
    if (key === "mode") {
      const v = String(raw ?? "").trim();
      if (v !== "manual" && v !== "auto") bad.push("mode (manual hoặc auto)");
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
      `insert into rso_settings (key, value, updated_at) values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  return getRsoSettings();
}

export type RunState = { on: boolean; at: string; by: string };

export async function runState(): Promise<RunState> {
  return (await getState<RunState>("run")) ?? { on: false, at: new Date(0).toISOString(), by: "" };
}

export async function setRunning(on: boolean, by: string): Promise<RunState> {
  const next: RunState = { on, at: new Date().toISOString(), by };
  await setState("run", next);
  return next;
}
