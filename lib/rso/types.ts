/* ==========================================================================
   Radar Sold Out — the words the screen and the job share. No server-only
   import: the client components read the labels too.
   ========================================================================== */

export const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Chờ gửi",
  sent: "Đã gửi",
  failed: "Lỗi gửi",
  skipped: "Bị loại",
};

/** Where the case stands after the heads-up went. */
export const STAGE_LABEL: Record<string, string> = {
  waiting: "Chờ khách nhập hàng",
  replied: "Khách đã trả lời",
  stopped: "Dừng liên hệ",
  still_out: "Vẫn hết hàng",
  restocked: "Đã nhập hàng",
  restocked_no_ask: "Đã nhập hàng, không xin review",
  review_asked: "Đã xin review",
  reviewed: "Đã review",
  no_review: "Không review",
  manual: "Cần kiểm tra tay",
};

export const SKIP_REASONS = {
  no_ac2: "AC2 không tìm thấy store",
  uninstalled: "Đã gỡ app",
  no_channel: "Không có email / hội thoại Crisp",
  blocked_segment: "Khách có segment dev / bad-review trên Crisp",
  low_visits: "Lượt xem quá ít",
  not_selling: "Store đang ngừng bán — không có đơn hàng 60 ngày (Radar)",
  admin: "Admin bỏ qua",
} as const;
export type SkipCode = keyof typeof SKIP_REASONS;

export const INTENT_LABEL: Record<string, string> = {
  thanks: "Cảm ơn",
  restocked: "Báo đã nhập hàng",
  help: "Cần hỗ trợ",
  discontinued: "Ngừng bán sản phẩm",
  decline: "Không muốn nhận tin",
  other: "Khác",
};

export const MOOD_LABEL: Record<string, string> = { happy: "Hài lòng", neutral: "Bình thường", unhappy: "Không hài lòng" };

export type RsoPage = { title: string; path: string; visits: number; products: string[]; count: number };

export type RsoTarget = {
  id: string;
  store_domain: string;
  store_name: string | null;
  email: string | null;
  pf_plan: string | null;
  pf_price: string | null;
  pages: RsoPage[];
  visits: number;
  radar_group: string | null;
  reviewed_before: boolean;
  session_id: string | null;
  ticket_link: string | null;
  status: string;
  skip_code: string | null;
  skip_reason: string | null;
  message: string | null;
  error: string | null;
  approved_by: string | null;
  sent_at: string | null;
  sent_by: string | null;
  stage: string | null;
  read_at: string | null;
  replied_at: string | null;
  last_reply_at: string | null;
  last_reply_text: string | null;
  replies: number;
  reply_intent: string | null;
  mood: string | null;
  mood_note: string | null;
  checked_at: string | null;
  restocked_at: string | null;
  review_status: string | null;
  review_message: string | null;
  review_asked_at: string | null;
  review_asked_by: string | null;
  review_error: string | null;
  app_review: number | null;
  reviewed_at: string | null;
  tracked_at: string | null;
  /** the last customer message read (about the stock or not) — the next read starts after it */
  reply_seen_at: string | null;
  upgraded_at: string | null;
  upgraded_from: string | null;
  upgraded_to: string | null;
  upgraded_price: string | null;
  ac2_checked_at: string | null;
  /** when the sender was mentioned on the customer's first reply about the stock */
  mentioned_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * How an upgrade came: organic — they had read the heads-up before upgrading;
 * thường — sent, never read (or read only after), and upgraded anyway.
 */
export const upgradeKind = (t: Pick<RsoTarget, "upgraded_at" | "read_at">): "organic" | "normal" | null =>
  !t.upgraded_at ? null : t.read_at && new Date(t.read_at).getTime() <= new Date(t.upgraded_at).getTime() ? "organic" : "normal";
export const UPGRADE_KIND_LABEL = { organic: "Nâng cấp organic (đã xem tin)", normal: "Nâng cấp thường (chưa xem tin)" } as const;

/** "VitaTok CGM, SusWel Sensor" — the first product of each page. */
export const productNames = (pages: RsoPage[]) => [...new Set(pages.map((p) => p.products[0] || p.title).filter(Boolean))];
