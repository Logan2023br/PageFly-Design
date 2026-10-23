/* ==========================================================================
   Display helpers shared by the server and client halves of the admin
   screens. No server-only imports here — this file ships to the browser.
   ========================================================================== */

export const STATUS_LABEL: Record<string, string> = {
  new: "Mới",
  building: "Đang build",
  pending_review: "Chờ duyệt",
  approved: "Đã duyệt",
  sent: "Đã gửi",
  viewed: "Đã xem",
  downloaded: "Đã tải",
  used: "Đã dùng",
  upgraded: "Nâng cấp",
  rebuild_requested: "Chờ rebuild",
  rejected: "Từ chối",
  control: "Đối chứng",
  skipped: "Bỏ qua",
  error: "Lỗi",
  uninstalled: "Gỡ app",
};

/** Tailwind classes per status: green moving forward, amber waiting on us,
    red stopped. */
export function statusTone(s: string): string {
  if (["upgraded", "used", "downloaded"].includes(s)) return "border-pf-success/30 bg-pf-success/10 text-pf-success";
  if (["sent", "viewed", "approved"].includes(s)) return "border-pf-primary-hi/30 bg-pf-primary/10 text-pf-primary-hi";
  if (["pending_review", "rebuild_requested", "building", "new"].includes(s)) return "border-pf-warn/30 bg-pf-warn/10 text-pf-warn";
  if (["rejected", "error", "uninstalled"].includes(s)) return "border-pf-danger/30 bg-pf-danger/10 text-pf-danger";
  return "border-pf-border bg-pf-card-hi text-pf-muted";
}

export const KIND_LABEL: Record<string, string> = {
  initial: "Tin đầu tiên",
  followup1: "Follow-up 1",
  followup2: "Follow-up 2",
  review: "Xin review",
  custom: "Tin thủ công",
  view_reminder: "Nhắc tải (đã xem)",
  edit_offer: "Chỉnh sửa miễn phí (đã tải)",
};

export const MESSAGE_STATUS_LABEL: Record<string, string> = {
  pending_review: "Chờ duyệt",
  approved: "Chờ gửi",
  sent: "Đã gửi",
  failed: "Lỗi gửi",
  rejected: "Đã bỏ",
};

/** dd/MM HH:mm in Vietnam time — the team's clock. */
export function fmtVN(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    ...(withYear ? { year: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** The customer's wall clock, and whether it is inside the send window. */
export function customerClock(tz: string | null | undefined, start = 9, end = 19): { time: string; hour: number; inWindow: boolean; tz: string } {
  const zone = tz || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const hour = Number(get("hour")) % 24;
    return { time: `${get("weekday")} ${get("hour")}:${get("minute")}`, hour, inWindow: hour >= start && hour < end, tz: zone };
  } catch {
    return { time: "?", hour: 12, inWindow: true, tz: zone };
  }
}

export function daysLeft(expires: string | null | undefined): number | null {
  if (!expires) return null;
  return Math.ceil((new Date(expires).getTime() - Date.now()) / 86_400_000);
}

export function hoursSince(iso: string | null | undefined): number {
  return iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : 0;
}

/** Why Claude drafted this, in the words the reviewer needs. */
export function draftReason(m: {
  kind: string;
  sent_at_lead: string | null;
  unique_views: number;
  downloads: number;
  rating: number | null;
  sentiment: string | null;
  created_by: string;
}): string {
  const h = Math.round(hoursSince(m.sent_at_lead));
  switch (m.kind) {
    case "followup1":
      return `${h}h sau khi gửi, chưa mở link`;
    case "followup2":
      return m.unique_views > 0 ? `${h}h sau khi gửi, đã xem nhưng chưa tải` : `${h}h sau khi gửi, chưa tải`;
    case "review":
      if (m.rating && m.rating >= 4) return `Khách chấm ${m.rating} sao`;
      if (m.sentiment === "Positive") return "Phản hồi tích cực";
      return "Xin review";
    case "custom":
      return m.created_by.startsWith("admin:") ? `Soạn bởi ${m.created_by.slice(6)}` : "Tin thủ công";
    default:
      return "";
  }
}

export const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `$${Number(n).toFixed(Number(n) % 1 ? 2 : 0)}`);
export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
export const handleOf = (domain: string) => domain.replace(/\.myshopify\.com$/i, "");

/** The wa.me link for a phone, or null. WhatsApp needs the number in full
    international form, so only a number written with its country code (+… or
    00…) gets one — a local "0912…" would open a chat with whoever has that
    number in some other country. */
export function whatsappUrl(phone: string | null | undefined): string | null {
  const p = String(phone ?? "").trim();
  if (!/^(\+|00)/.test(p)) return null;
  const digits = p.replace(/^00/, "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

/** A Crisp (markdown) message as WhatsApp text. Bold keeps being bold, in
    WhatsApp's own syntax — one `*` each side instead of two — and every link
    is written out as "text: url", since WhatsApp has no link syntax and makes
    the URL tappable. */
export function whatsappText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\(([^)\s]*)\)/g, (_, text: string, url: string) => (text.trim() ? `${text.trim()}: ${url}` : url))
    .replace(/\*\*([^*\n]+?)\*\*/g, "*$1*");
}
