/* ==========================================================================
   Weekly reports of the three upsells — what each one shows, in what order.

   A week is Monday 00:00 to the next Monday 00:00, Vietnam time. Each report
   has two halves, because a week can be asked two questions:

     cohort    the customers first messaged that week, and everything they
               have done since — up to when the report was made. The rates
               (đọc, phản hồi, nâng cấp…) are over this group.
     activity  everything that happened during the week, whoever it was
               from — a reply this week to a message sent last week counts
               here, not in the cohort.

   The numbers are worked out in compute.ts, one flat record per week; this
   file only says how to lay them out. No server-only import: plain data.
   ========================================================================== */

import type { AdminSection } from "@/lib/adminSections";

export const REPORT_UPSELLS = ["ssu", "ucp2", "bpu"] as const;
export type ReportUpsell = (typeof REPORT_UPSELLS)[number];

export type Item = {
  key: string;
  label: string;
  /** shown as a share of this key's value — "12 · 34%" */
  of?: string;
  money?: boolean;
};
export type Section = { title: string; note: string; items: Item[] };

export type ReportDef = {
  label: string;
  /** the admin section that may read it, and its screen */
  section: AdminSection;
  href: string;
  /** what the upsell is, one line under the title */
  blurb: string;
  /** the tiles at the top */
  headline: Item[];
  sections: Section[];
};

const COHORT_NOTE = "Khách nhận tin đầu tiên trong tuần, và những gì họ đã làm tính tới lúc lập báo cáo. Tỷ lệ tính trên số khách này.";
const ACTIVITY_NOTE = "Mọi việc xảy ra trong tuần, của bất kỳ khách nào — kể cả khách được gửi từ các tuần trước.";

export const REPORTS: Record<ReportUpsell, ReportDef> = {
  ssu: {
    label: "Upsell Collection Pages",
    section: "ssu",
    href: "/design/admin/collections/upsell",
    blurb: "Khách bấm Select template của Store set trong PageFly — tin cảm ơn + chỉnh sửa miễn phí, chăm sóc, xin review.",
    headline: [
      { key: "c_sent", label: "Khách được gửi" },
      { key: "c_read", label: "Đã đọc tin", of: "c_sent" },
      { key: "c_replied", label: "Đã phản hồi", of: "c_sent" },
      { key: "c_upgraded", label: "Đã nâng cấp", of: "c_sent" },
      { key: "c_mrr", label: "MRR tăng", money: true },
      { key: "c_reviewed", label: "Đã review", of: "c_sent" },
    ],
    sections: [
      {
        title: "Khách gửi trong tuần",
        note: COHORT_NOTE,
        items: [
          { key: "c_sent", label: "Khách được gửi tin cảm ơn" },
          { key: "c_delivered", label: "Tin đã tới khách", of: "c_sent" },
          { key: "c_read", label: "Đã đọc tin", of: "c_sent" },
          { key: "c_replied", label: "Đã phản hồi", of: "c_sent" },
          { key: "c_pages_updated", label: "Đã cập nhật page (thêm / publish)", of: "c_sent" },
          { key: "c_reviewed", label: "Đã review app", of: "c_sent" },
          { key: "c_upgraded", label: "Đã nâng cấp", of: "c_sent" },
          { key: "c_mrr", label: "MRR tăng", money: true },
          { key: "c_uninstalled", label: "Đã gỡ app", of: "c_sent" },
        ],
      },
      {
        title: "Hoạt động trong tuần",
        note: ACTIVITY_NOTE,
        items: [
          { key: "a_clicks", label: "Lượt bấm Select template (Store set)" },
          { key: "a_clicked_stores", label: "Store bấm Select template" },
          { key: "a_new_customers", label: "Khách mới (lần đầu bấm)" },
          { key: "a_messages", label: "Tin nhắn đã gửi" },
          { key: "a_read", label: "Khách đọc tin" },
          { key: "a_replied", label: "Khách phản hồi" },
          { key: "a_pages_updated", label: "Khách cập nhật page" },
          { key: "a_reviewed", label: "Lượt review app" },
          { key: "a_upgraded", label: "Lượt nâng cấp" },
          { key: "a_mrr", label: "MRR tăng", money: true },
          { key: "a_uninstalled", label: "Lượt gỡ app" },
        ],
      },
    ],
  },
  ucp2: {
    label: "Upsell Collection Pages 2",
    section: "ucp2",
    href: "/design/admin/collections/upsell2",
    blurb: "Tin mời Collection Pages (sheet User Testing) — đọc, click link, tải template, phản hồi, nâng cấp, review.",
    headline: [
      { key: "c_sent", label: "Khách được gửi" },
      { key: "c_read", label: "Đã đọc tin", of: "c_sent" },
      { key: "c_replied", label: "Đã phản hồi", of: "c_sent" },
      { key: "c_upgraded", label: "Đã nâng cấp", of: "c_sent" },
      { key: "c_mrr", label: "MRR tăng", money: true },
      { key: "c_reviewed", label: "Review 5★", of: "c_sent" },
    ],
    sections: [
      {
        title: "Khách gửi trong tuần",
        note: COHORT_NOTE,
        items: [
          { key: "c_sent", label: "Khách được gửi tin mời" },
          { key: "c_delivered", label: "Tin đã tới khách", of: "c_sent" },
          { key: "c_read", label: "Đã đọc tin", of: "c_sent" },
          { key: "c_clicked", label: "Đã click link", of: "c_sent" },
          { key: "c_clicks", label: "Số lượt click" },
          { key: "c_downloaded", label: "Đã tải template", of: "c_sent" },
          { key: "c_replied", label: "Đã phản hồi", of: "c_sent" },
          { key: "c_replies", label: "Số tin phản hồi" },
          { key: "c_reviewed", label: "Review 5★", of: "c_sent" },
          { key: "c_upgraded", label: "Đã nâng cấp", of: "c_sent" },
          { key: "c_mrr", label: "MRR tăng", money: true },
          { key: "c_uninstalled", label: "Đã gỡ app", of: "c_sent" },
        ],
      },
      {
        title: "Hoạt động trong tuần",
        note: ACTIVITY_NOTE,
        items: [
          { key: "a_read", label: "Khách đọc tin" },
          { key: "a_clicked", label: "Khách click link lần đầu" },
          { key: "a_downloaded", label: "Khách tải template" },
          { key: "a_replied", label: "Khách phản hồi lần đầu" },
          { key: "a_reviewed", label: "Lượt review 5★" },
          { key: "a_upgraded", label: "Lượt nâng cấp" },
          { key: "a_mrr", label: "MRR tăng", money: true },
          { key: "a_uninstalled", label: "Lượt gỡ app" },
        ],
      },
    ],
  },
  bpu: {
    label: "Upsell Build 2 pages",
    section: "upsell",
    href: "/design/admin/upsell",
    blurb: "Claude dựng 2 page cho store mới cài — gửi page, follow-up, nhắc tải, chỉnh sửa miễn phí, so với nhóm đối chứng.",
    headline: [
      { key: "c_sent", label: "Khách được gửi page" },
      { key: "c_read", label: "Đã đọc tin", of: "c_sent" },
      { key: "c_viewed", label: "Đã xem page", of: "c_sent" },
      { key: "c_downloaded", label: "Đã tải page", of: "c_sent" },
      { key: "c_upgraded", label: "Đã nâng cấp", of: "c_sent" },
      { key: "c_mrr", label: "MRR tăng", money: true },
    ],
    sections: [
      {
        title: "Khách gửi trong tuần",
        note: COHORT_NOTE,
        items: [
          { key: "c_sent", label: "Khách được gửi 2 page" },
          { key: "c_read", label: "Đã đọc tin", of: "c_sent" },
          { key: "c_viewed", label: "Đã xem page", of: "c_sent" },
          { key: "c_views", label: "Số lần xem page" },
          { key: "c_downloaded", label: "Đã tải page", of: "c_sent" },
          { key: "c_downloads", label: "Số lần tải" },
          { key: "c_replied", label: "Đã phản hồi", of: "c_sent" },
          { key: "c_reviewed", label: "Đã review app", of: "c_sent" },
          { key: "c_whatsapp", label: "Đã nhắn WhatsApp", of: "c_sent" },
          { key: "c_upgraded", label: "Đã nâng cấp", of: "c_sent" },
          { key: "c_up_normal", label: "· Nâng cấp thường", of: "c_upgraded" },
          { key: "c_up_organic", label: "· Nâng cấp organic", of: "c_upgraded" },
          { key: "c_up_claim", label: "· Nâng cấp claim", of: "c_upgraded" },
          { key: "c_mrr", label: "MRR tăng", money: true },
          { key: "c_uninstalled", label: "Đã gỡ app", of: "c_sent" },
          { key: "k_control", label: "Đối chứng: lead mới trong tuần (không build)" },
          { key: "k_upgraded", label: "Đối chứng: đã nâng cấp", of: "k_control" },
        ],
      },
      {
        title: "Hoạt động trong tuần",
        note: ACTIVITY_NOTE,
        items: [
          { key: "a_leads", label: "Lead mới (nhóm test)" },
          { key: "a_built", label: "Lead đã build xong page" },
          { key: "a_messages", label: "Tin nhắn đã gửi" },
          { key: "a_views", label: "Lần xem page" },
          { key: "a_viewers", label: "Khách xem page" },
          { key: "a_downloads", label: "Lần tải page" },
          { key: "a_downloaders", label: "Khách tải page" },
          { key: "a_replied", label: "Khách phản hồi" },
          { key: "a_upgraded", label: "Lượt nâng cấp" },
          { key: "a_mrr", label: "MRR tăng", money: true },
          { key: "a_uninstalled", label: "Lượt gỡ app" },
        ],
      },
    ],
  },
};

export function isReportUpsell(s: string): s is ReportUpsell {
  return (REPORT_UPSELLS as readonly string[]).includes(s);
}

/* ---- weeks, Vietnam time ------------------------------------------------ */

const VN_MS = 7 * 3_600_000;
const DAY = 86_400_000;

/** The Monday (yyyy-mm-dd, Vietnam) of the week `at` falls in. */
export function weekOf(at: Date = new Date()): string {
  const vn = new Date(at.getTime() + VN_MS);
  const back = (vn.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() - back)).toISOString().slice(0, 10);
}

export function addWeeks(week: string, n: number): string {
  return new Date(Date.parse(`${week}T00:00:00Z`) + n * 7 * DAY).toISOString().slice(0, 10);
}

/** When the week starts, as an instant. */
export function weekStartAt(week: string): Date {
  return new Date(Date.parse(`${week}T00:00:00Z`) - VN_MS);
}

/** The week has ended: its report can be saved. */
export function weekIsOver(week: string, now: Date = new Date()): boolean {
  return weekStartAt(addWeeks(week, 1)).getTime() <= now.getTime();
}

export function isWeek(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && weekOf(new Date(Date.parse(`${s}T12:00:00Z`) - VN_MS)) === s;
}

/** "26/10 – 01/11/2026" */
export function weekLabel(week: string): string {
  const a = new Date(`${week}T00:00:00Z`);
  const b = new Date(a.getTime() + 6 * DAY);
  const dm = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${dm(a)} – ${dm(b)}/${b.getUTCFullYear()}`;
}

export type ReportData = {
  metrics: Record<string, number>;
  /** the week before, worked out at the same moment */
  prev: Record<string, number>;
  /** messages sent during the week, per kind */
  messages: { label: string; n: number }[];
  /** the cohort per customer type, where the upsell has types */
  byType?: { type: string; sent: number; read: number; replied: number; upgraded: number; reviewed: number }[];
};

export type Report = {
  upsell: ReportUpsell;
  week: string;
  data: ReportData;
  generated_at: string;
  generated_by: string;
  /** not saved: worked out for this view (the week is not over, or no one made it yet) */
  live?: boolean;
};
