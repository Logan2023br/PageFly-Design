/* ==========================================================================
   Store set upsell — shapes and labels. No server-only import: the admin
   screen's client half reads the labels too.
   ========================================================================== */

/**
 * Where a customer's upsell is.
 *
 *   new             seen in Mixpanel, not checked against AC2 / Crisp yet
 *   reviewed        already gave us app_review 5 on Crisp — no message, ever
 *   skipped         no email, a development store, uninstalled, or an admin said so
 *   eligible        could be messaged, but the mode is off (or auto, and the select is old)
 *   pending_review  a message waits for an admin on "Chờ duyệt"
 *   approved        approved, goes out on the next minute
 *   sent            sent; what happened next is in the tracking columns
 *   failed          the send failed — retry or drop it
 */
export const SSU_STATUSES = ["new", "reviewed", "skipped", "eligible", "pending_review", "approved", "sent", "failed"] as const;
export type SsuStatus = (typeof SSU_STATUSES)[number];

export const SSU_STATUS_LABEL: Record<SsuStatus, string> = {
  new: "Chưa kiểm tra",
  reviewed: "Đã review 5★",
  skipped: "Bỏ qua",
  eligible: "Đủ điều kiện",
  pending_review: "Chờ duyệt",
  approved: "Chờ gửi",
  sent: "Đã gửi",
  failed: "Lỗi gửi",
};

export const SSU_MESSAGE_KINDS = ["thanks", "review_ask", "custom"] as const;
export type SsuMessageKind = (typeof SSU_MESSAGE_KINDS)[number];

export const SSU_KIND_LABEL: Record<SsuMessageKind, string> = {
  thanks: "Cảm ơn + chỉnh sửa miễn phí",
  review_ask: "Xin review app",
  custom: "Tin tự viết",
};

export const SSU_MESSAGE_STATUS_LABEL: Record<string, string> = {
  pending_review: "chờ duyệt",
  approved: "chờ gửi",
  sending: "đang gửi",
  sent: "đã gửi",
  failed: "lỗi",
  rejected: "đã bỏ",
};

export type SsuMessageStatus = "pending_review" | "approved" | "sending" | "sent" | "failed" | "rejected";

export type SsuCustomer = {
  store_domain: string;
  email: string | null;
  store_name: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  timezone: string | null;
  shopify_plan: string | null;
  pf_plan: string | null;
  pf_price: number | null;
  pages: number | null;
  published: number | null;
  app_status: string | null;
  installed_at: string | null;
  uninstalled_at: string | null;
  is_dev_store: boolean | null;
  sets: string[];
  selections: number;
  first_selected_at: string | null;
  last_selected_at: string | null;
  ac2_synced_at: string | null;
  crisp_checked_at: string | null;
  crisp_conversations: number | null;
  crisp_sessions: { session_id: string; link?: string; updated_at: string | null; app_review: number | null; subject: string | null; state: string | null }[] | null;
  app_review: number | null;
  status: SsuStatus;
  skip_reason: string | null;
  crisp_session: string | null;
  ticket_link: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied: boolean;
  last_reply_at: string | null;
  last_reply_text: string | null;
  needs_check: boolean;
  checked_by: string | null;
  checked_at: string | null;
  review_asked_at: string | null;
  reviewed_at: string | null;
  price_at_send: number | null;
  pages_at_send: number | null;
  published_at_send: number | null;
  upgraded_at: string | null;
  upgraded_to: string | null;
  pages_updated_at: string | null;
  tracked_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SsuMessage = {
  id: string;
  store_domain: string;
  kind: SsuMessageKind;
  content: string;
  status: SsuMessageStatus;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  error: string | null;
  attempts: number;
  failed_at: string | null;
  created_at: string;
};

export type SsuSelection = {
  id: number;
  insert_id: string;
  event_time: string;
  store_domain: string | null;
  email: string | null;
  store_set: string;
  template_id: string | null;
  template_type: string | null;
  page_type: string | null;
  min_plan: string | null;
  is_locked: boolean | null;
  is_dev_store: boolean | null;
  source: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  browser: string | null;
  os: string | null;
  editor_version: string | null;
  distinct_id: string | null;
};

export type SsuEvent = { id: number; store_domain: string | null; type: string; actor: string; detail: Record<string, unknown> | null; created_at: string };

/** What the last runs of the job did, for the line at the top of the screen. */
export type SsuJobState = {
  at: string;
  fetched?: number;
  new_selections?: number;
  new_customers?: number;
  checked?: number;
  drafted?: number;
  sent?: number;
  failed?: number;
  tracked?: number;
  errors?: string[];
};

/** "ember-roast" → "Ember Roast", when the set is not in our own list. */
export function titleOfSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
