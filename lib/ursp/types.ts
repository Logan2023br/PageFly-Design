/* ==========================================================================
   Upsell Responsive — the words the screen and the job share. No server-only
   import: the client components read the labels too.
   ========================================================================== */

export const SEGMENTS = {
  recap: { label: "Recap", hint: "Ticket support mới trong file Recap (trừ Đợi TS check / Hết ca chưa giải quyết)" },
  active: { label: "Active", hint: "Store hoạt động hôm nay (AC2)" },
} as const;
export type Segment = keyof typeof SEGMENTS;
export const isSegment = (s: unknown): s is Segment => s === "recap" || s === "active";

export const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Chờ gửi",
  sending: "Đang gửi",
  sent: "Đã gửi",
  failed: "Lỗi gửi",
  skipped: "Bị loại",
  held: "Giữ cho bản B",
};

/** Why a store got no message — the code is what the stats group by. */
export const SKIP_REASONS = {
  resolution: "Resolution Đợi TS check / Hết ca chưa giải quyết",
  no_domain: "Recap không có store domain",
  no_ticket: "Recap không có ticket Crisp",
  no_ac2: "AC2 không tìm thấy store",
  uninstalled: "Đã gỡ app",
  shopify_unpaid: "Shopify không trả phí (dev / partner / trial…)",
  too_many_pages: "Quá số page publish cho phép",
  no_email: "Không có email",
  /* no longer applied: such stores are looked at again */
  contacted: "Đã liên hệ support trên Crisp (luật cũ, đang xét lại)",
  other_segment: "Đã nhắn ở phân khúc khác",
  already_sent: "Đã gửi tin này cho store / email này rồi",
  blocked_segment: "Khách có segment dev / bad-review trên Crisp",
  reviewed: "Khách đã review app 5★ trên Crisp",
  ended: "Chương trình đã kết thúc",
  admin: "Admin bỏ qua",
} as const;
export type SkipCode = keyof typeof SKIP_REASONS;

export const INTENT_LABEL: Record<string, string> = {
  agree: "Đồng ý",
  decline: "Từ chối",
  question: "Hỏi thêm",
  other: "Khác",
};

export const MOOD_LABEL: Record<string, string> = {
  happy: "Hài lòng",
  neutral: "Bình thường",
  unhappy: "Không hài lòng",
};

/** Where a case stands — what a note is filed under. */
export const STAGE_LABEL: Record<string, string> = {
  open: "Chưa xử lý",
  working: "Đang xử lý",
  done: "Đã xử lý xong",
  dismissed: "Đã bỏ qua",
};

export type UrspNote = { id: string; target_id: string; stage: string; text: string; by: string; at: string; kind: "team" | "customer" | "auto" };

/** "1: …" typed by hand: the numbering is the screen's, so the typed one goes. */
export const unnumbered = (s: string) => s.replace(/^\s*\d+\s*[:.)\-–]\s*/, "").trim();

export type UrspTarget = {
  id: string;
  segment: Segment;
  store_domain: string;
  recap_key: string | null;
  email: string | null;
  store_name: string | null;
  country: string | null;
  shopify_plan: string | null;
  pf_plan: string | null;
  pf_price: string | null;
  pages_published: number | null;
  session_id: string | null;
  ticket_link: string | null;
  source: Record<string, string | number | null> | null;
  status: string;
  skip_code: string | null;
  skip_reason: string | null;
  message: string | null;
  error: string | null;
  approved_by: string | null;
  wait_until: string | null;
  sent_at: string | null;
  sent_by: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  last_reply_at: string | null;
  last_reply_text: string | null;
  replies: number;
  reply_intent: string | null;
  mood: string | null;
  mood_note: string | null;
  classified_at: string | null;
  mentioned_at: string | null;
  offer_until: string | null;
  variant: string | null;
  followup_status: string | null;
  followup_message: string | null;
  followup_approved_by: string | null;
  followup_sent_at: string | null;
  followup_error: string | null;
  working_at: string | null;
  working_by: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  dismiss_reason: string | null;
  review_ask_status: string | null;
  review_asked_at: string | null;
  review_asked_by: string | null;
  review_ask_error: string | null;
  after_done_read: string | null;
  done_at: string | null;
  done_by: string | null;
  first_price: string | null;
  first_ac2_at: string | null;
  first_review: number | null;
  upgraded_at: string | null;
  upgraded_to: string | null;
  upgraded_price: string | null;
  app_review: number | null;
  reviewed_at: string | null;
  uninstalled_at: string | null;
  crisp_checked_at: string | null;
  slow_checked_at: string | null;
  tracked_at: string | null;
  created_at: string;
  updated_at: string;
};
