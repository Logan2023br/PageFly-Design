import "server-only";

import { UpsellError } from "@/lib/upsell/types";
import { db } from "./db";

/* ==========================================================================
   nff_settings — key/value with the defaults written here. Every message
   waits on Chờ duyệt: nothing goes out until someone presses Duyệt & gửi.
   ========================================================================== */

/* The message, as the team wrote it. {name} the store's name, {store} its
   handle (the .myshopify.com domain without .myshopify.com), {pic} the sender.
   Each feature's title is its own link, bold. */
export const DEFAULT_TEMPLATE = `Hi **{name}**,

This is **{pic}** from the PageFly Lead Technical Support Team.
Hope you are having a great day.

Great news: PageFly has just launched **new features** to help you build a more professional store and **turn more of your visitors into orders**. Here they are:

1. **[Funnel Builder](https://admin.shopify.com/store/{store}/apps/pagefly/builder/funnel)**: see where shoppers drop off on the way to buying a product, and the one fix to make next.
2. **[Bundles](https://admin.shopify.com/store/{store}/apps/pagefly/builder/discounts)**: offer quantity breaks, bundles and buy X get Y right on your product page.
3. **[Post-purchase offer](https://admin.shopify.com/store/{store}/apps/pagefly/builder/post-purchase)**: right after checkout, customers can add one more item to the same order with a single click.

You can open and try each one right from your **PageFly dashboard**.

We'd love to know: **are these the features your store needs right now?**

If any of them catches your interest, **just reply here** with the one you'd like to explore. **One of our specialists** will walk you through how it works and help you set it up.

Your feedback truly matters to us. We picked these features carefully to help stores like yours grow, and hearing what you think, even if they're not a fit, helps us build what you actually need.

We look forward to hearing from you.

Best regards,
**{pic}**
PageFly Lead Technical Support Team`;

export const NFF_DEFAULTS = {
  sender_name: "Logan",
  /** the sender's picture on Crisp — Logan's; empty: the Crisp operator of that name, found by the token */
  sender_avatar:
    "https://image.crisp.chat/avatar/operator/11c92319-89c1-42be-b4da-2bf5e40568c3/120/?avatar=https%3A%2F%2Fstorage.crisp.chat%2Fusers%2Favatar%2Foperator%2F-%2F6%2F1%2Fa%2F9%2F61a991f5c29c8c00%2Favatar_7ov3o3.jpg",
  /** empty: the built-in message above */
  template: "",
  /** a conversation with a message this recent: support may be mid-chat, the message waits */
  quiet_minutes: 30,
  /** how long a sent store is followed (read, reply) */
  tracking_days: 30,
} as const;

export type NffKey = keyof typeof NFF_DEFAULTS;
export type NffSettings = { [K in NffKey]: (typeof NFF_DEFAULTS)[K] extends number ? number : string };

export const NFF_HELP: Record<NffKey, string> = {
  sender_name: "Tên người gửi trên Crisp ({pic})",
  sender_avatar: "Link ảnh avatar người gửi trên Crisp (mặc định: avatar của Logan). Để trống: tự lấy avatar của operator cùng tên trên Crisp",
  template:
    "Tin giới thiệu tính năng mới. Biến: {name} (tên store) {store} (domain bỏ .myshopify.com, dùng trong link) {pic}. Link: [chữ](https://…), in đậm **…**. Để trống dùng mẫu mặc định. Đổi mẫu thì tin đang Chờ duyệt được soạn lại",
  quiet_minutes: "Hội thoại có tin nhắn trong bấy nhiêu phút gần nhất (khách đang chat với support) thì tin đợi, gửi sau",
  tracking_days: "Theo dõi đã xem / phản hồi bấy nhiêu ngày sau khi gửi",
};

export const NFF_NUMERIC = (Object.keys(NFF_DEFAULTS) as NffKey[]).filter((k) => typeof NFF_DEFAULTS[k] === "number");

export async function getNffSettings(): Promise<NffSettings> {
  const { rows } = await (await db()).query<{ key: string; value: unknown }>("select key, value from nff_settings");
  const raw = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, unknown> = { ...NFF_DEFAULTS };
  for (const key of Object.keys(NFF_DEFAULTS) as NffKey[]) {
    if (!raw.has(key)) continue;
    const def = NFF_DEFAULTS[key];
    const v = raw.get(key);
    if (typeof def === "number") {
      const n = Number(v);
      out[key] = Number.isFinite(n) ? n : def;
    } else out[key] = String(v ?? "");
  }
  return out as NffSettings;
}

export async function saveNffSettings(patch: Record<string, unknown>): Promise<NffSettings> {
  const rows: [string, unknown][] = [];
  const bad: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (!Object.hasOwn(NFF_DEFAULTS, key)) {
      bad.push(`${key} (không có setting này)`);
      continue;
    }
    const def = NFF_DEFAULTS[key as NffKey];
    if (typeof def === "number") {
      const n = typeof raw === "string" ? (raw.trim() === "" ? NaN : Number(raw)) : typeof raw === "number" ? raw : NaN;
      if (!Number.isFinite(n) || n < 0) bad.push(`${key} (phải là số ≥ 0)`);
      else rows.push([key, n]);
    } else rows.push([key, String(raw ?? "")]);
  }
  if (bad.length) throw new UpsellError(`Chưa lưu — giá trị không hợp lệ: ${bad.join(", ")}.`, 422);
  const q = await db();
  for (const [key, value] of rows)
    await q.query(
      `insert into nff_settings (key, value, updated_at) values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  return getNffSettings();
}
