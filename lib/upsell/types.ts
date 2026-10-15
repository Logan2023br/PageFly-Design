/* ==========================================================================
   Upsell Build Pages — the shapes, written once.

   Field names are snake_case on purpose and match the database columns one
   for one: `scripts/bpu/bpu_ops.py` and the Builder prompt read and write
   these exact names over the API, so a camelCase layer in between would be a
   translation table that one day disagrees with itself.
   ========================================================================== */

export const LEAD_STATUSES = [
  "new",
  "building",
  "pending_review",
  "approved",
  "sent",
  "viewed",
  "downloaded",
  "used",
  "upgraded",
  "rebuild_requested",
  "rejected",
  "control",
  "skipped",
  "error",
  "uninstalled",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** The statuses only an admin (or the build pipeline) moves a lead out of.
    `leads/sync` never overwrites any of them. */
export const PRE_SEND: ReadonlySet<LeadStatus> = new Set([
  "new",
  "building",
  "pending_review",
  "approved",
  "rebuild_requested",
  "rejected",
]);

/** After a send, a lead only ever moves forward along this line. */
export const FORWARD: readonly LeadStatus[] = ["sent", "viewed", "downloaded", "used", "upgraded"];

/** The page is the customer's to see from here on. */
export const VISIBLE: ReadonlySet<LeadStatus> = new Set(["sent", "viewed", "downloaded", "used", "upgraded", "uninstalled"]);

/** What the script tracks: `leads/export?active=1`. */
export const ACTIVE: readonly LeadStatus[] = ["approved", "sent", "viewed", "downloaded", "used", "control"];

export const PAGE_TYPES = ["home", "product", "collection", "about", "landing", "sale", "faq", "contact"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export const PAGE_LABELS: Record<PageType, string> = {
  home: "Home page",
  product: "Product page",
  collection: "Collection page",
  about: "About page",
  landing: "Landing page",
  sale: "Sale page",
  faq: "FAQ page",
  contact: "Contact page",
};

export const MESSAGE_KINDS = ["initial", "followup1", "followup2", "review", "custom"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MESSAGE_STATUSES = ["pending_review", "approved", "sent", "failed", "rejected"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export type SendMode = "window" | "now";

export const CUSTOMER_EVENTS = ["view", "preview_open", "device_toggle", "download", "cta_click", "feedback"] as const;
export type CustomerEvent = (typeof CUSTOMER_EVENTS)[number];

export type InstallRow = {
  store_domain: string;
  installed_at: string | null;
  store_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  timezone: string | null;
  shopify_plan: string | null;
  pf_plan: string | null;
  app_status: string | null;
  onboarding_intent: string | null;
  storefront: string | null;
  product_count: string | null;
  category_hint: string | null;
  email_type: string | null;
  lead_score: number | null;
  score_reasons: string | null;
  lead: boolean;
  skip_reason: string | null;
  rechecked: boolean;
  synced_at: string | null;
};

export type LeadRow = {
  lead_id: string;
  store_domain: string;
  store_name: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  timezone: string | null;
  shopify_plan: string | null;
  lead_score: number | null;
  score_reasons: string | null;
  category_hint: string | null;
  onboarding_intent: string | null;
  product_count: string | null;
  group: "test" | "control";
  status: LeadStatus;
  pic: string | null;
  priority: "normal" | "high";
  error: string | null;
  build_started_at: string | null;
  built_at: string | null;
  page1_type: string | null;
  page2_type: string | null;
  rebuild_note: string | null;
  rebuild_page_types: string[] | null;
  rebuild_count: number;
  build_note: string | null;
  build_timeouts: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  reject_reason: string | null;
  sent_at: string | null;
  crisp_session: string | null;
  ticket_link: string | null;
  plan_at_send: string | null;
  price_at_send: number | null;
  pages_at_send: number | null;
  published_at_send: number | null;
  message_read: boolean | null;
  replied: boolean | null;
  last_reply_at: string | null;
  last_reply_text: string | null;
  sentiment: string | null;
  feedback_summary: string | null;
  wants_changes: boolean | null;
  followup1_at: string | null;
  followup2_at: string | null;
  review_asked_at: string | null;
  reviewed_app: boolean | null;
  current_plan: string | null;
  current_price: number | null;
  pages_now: number | null;
  published_now: number | null;
  used_page: boolean | null;
  upgraded: boolean | null;
  upgraded_at: string | null;
  upgraded_to: string | null;
  mrr_added: number | null;
  app_status: string | null;
  uninstalled_at: string | null;
  internal_notes: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A lead as `leads/export` returns it: every column, plus what the design
    and the messages say about it. */
export type LeadExport = LeadRow & {
  design_id: string | null;
  design_url: string | null;
  views: number;
  unique_views: number;
  first_view_at: string | null;
  downloads: number;
  first_download_at: string | null;
  cta_clicks: number;
  rating: number | null;
  last_comment: string | null;
  message_kinds: MessageKind[];
};

export type DesignRow = {
  id: string;
  lead_id: string;
  version: number;
  category: string | null;
  language: string | null;
  expires_at: string | null;
  files_purged_at: string | null;
  created_at: string;
};

export type PageRow = {
  design_id: string;
  version: number;
  slot: 1 | 2;
  type: string;
  title: string | null;
  html_path: string | null;
  pagefly_path: string | null;
  thumb_path: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type MessageRow = {
  id: string;
  lead_id: string;
  kind: MessageKind;
  content: string;
  status: MessageStatus;
  send_mode: SendMode;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  error: string | null;
  created_at: string;
};

export type EventRow = {
  id: number;
  lead_id: string | null;
  design_id: string | null;
  type: string;
  actor: string;
  page_slot: number | null;
  rating: number | null;
  comment: string | null;
  detail: Record<string, unknown> | null;
  visitor_id: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  created_at: string;
};

/** A refusal the caller caused: wrong state, unknown id, bad input. Routes
    answer it with its status; anything else is a 500. */
export class UpsellError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "UpsellError";
  }
}
