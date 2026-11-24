/* ==========================================================================
   Feedback New Feature — the words the screen and the job share. No
   server-only import: the client components read the labels too.
   ========================================================================== */

export const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Chờ gửi",
  sent: "Đã gửi",
  failed: "Lỗi gửi",
  skipped: "Bỏ qua",
};

/** Which new feature the customer wants, as Haiku reads the reply. */
export const INTEREST_LABEL: Record<string, string> = {
  funnel: "Funnel Builder",
  bundles: "Bundles",
  post_purchase: "Post-purchase offer",
  several: "Nhiều tính năng",
  none: "Không cần",
  other: "Khác",
};

export const MOOD_LABEL: Record<string, string> = { happy: "Hài lòng", neutral: "Bình thường", unhappy: "Không hài lòng" };

export type NffTarget = {
  id: string;
  store_domain: string;
  store_name: string | null;
  email: string | null;
  session_id: string | null;
  ticket_link: string | null;
  ursp_id: string | null;
  ursp_stage: string | null;
  source: string | null;
  note: string | null;
  status: string;
  message: string | null;
  error: string | null;
  approved_by: string | null;
  sent_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  last_reply_at: string | null;
  last_reply_text: string | null;
  reply_seen_at: string | null;
  replies: number;
  interest: string | null;
  mood: string | null;
  mood_note: string | null;
  mentioned_at: string | null;
  tracked_at: string | null;
  created_at: string;
  updated_at: string;
};
