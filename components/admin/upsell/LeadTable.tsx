"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { daysLeft, fmtVN, hoursSince, money } from "@/lib/upsell/format";
import type { LeadListRow } from "@/lib/upsell/leads";
import { Button } from "../../ui";
import { CrispLink, ErrorLine, Pill, PhoneLine, StatusBadge, WhatsappMark, useAct } from "./bits";
import { Empty } from "./PendingPages";

/* ==========================================================================
   The lead tabs that are tables: Đang theo dõi, Đã nâng cấp, Hàng đợi build,
   Đối chứng, Từ chối / Lỗi / Bỏ qua. Same rows, different columns — each tab
   shows what someone opens it to check.
   ========================================================================== */

export type TableVariant = "tracking" | "upgraded" | "queue" | "control" | "closed";

const yes = (b: boolean | null | undefined) => (b ? "✓" : "—");

export function LeadTable({ rows, variant }: { rows: LeadListRow[]; variant: TableVariant }) {
  const router = useRouter();
  if (rows.length === 0) return <Empty text="Không có lead nào." />;
  /* On Đang theo dõi the whole row opens the lead — except a press on a link
     or button inside it, which does its own thing. */
  const rowOpens = variant === "tracking";
  const ticket = { head: "Ticket", cell: (l: LeadListRow) => <CrispLink href={l.ticket_link} /> };
  const cols: { head: string; cell: (l: LeadListRow) => React.ReactNode; className?: string }[] = [
    {
      head: "Store",
      cell: (l) => (
        <div className="min-w-[180px]">
          <Link href={`/design/admin/upsell/leads/${l.lead_id}`} className="font-semibold text-pf-text hover:text-pf-primary-hi">
            {l.store_name || l.store_domain}
          </Link>
          <div className="text-[11.5px] text-pf-faint">
            {l.store_domain} · {l.lead_id}
          </div>
          <PhoneLine phone={l.phone} />
        </div>
      ),
    },
    { head: "Trạng thái", cell: (l) => <StatusBadge status={l.status} /> },
  ];

  /* What the customer did with the pages. Written once and shown on both
     Đang theo dõi and Đã nâng cấp, so the two tabs cannot drift apart. */
  type Col = (typeof cols)[number];
  const activity: Col[] = [
    { head: "Gửi", cell: (l) => fmtVN(l.sent_at) },
    { head: "Đọc", cell: (l) => yes(l.message_read) },
    { head: "Xem", cell: (l) => `${l.unique_views} (${l.views})` },
    { head: "Tải", cell: (l) => l.downloads },
    { head: "Rating", cell: (l) => (l.rating ? `${l.rating}★` : "—") },
    {
      head: "Phản hồi",
      cell: (l) =>
        l.replied ? (
          <div className="max-w-[260px]">
            <Pill tone={l.sentiment === "Positive" ? "ok" : l.sentiment === "Negative" ? "bad" : "muted"}>{l.sentiment ?? "Chưa phân loại"}</Pill>
            <p className="mt-1 line-clamp-2 text-[11.5px] text-pf-muted">{l.feedback_summary || l.last_reply_text}</p>
          </div>
        ) : (
          "—"
        ),
    },
    {
      head: "Follow-up",
      cell: (l) => [l.followup1_at && "FU1", l.followup2_at && "FU2", l.review_asked_at && "Review"].filter(Boolean).join(" · ") || "—",
    },
    {
      head: "Link còn",
      cell: (l) => {
        const d = daysLeft(l.design_expires_at);
        return d === null ? "—" : d <= 0 ? <span className="text-pf-danger">Hết hạn</span> : `${d} ngày`;
      },
    },
  ];
  const whatsapp: Col = {
    head: "WhatsApp",
    cell: (l) => <WhatsappMark leadId={l.lead_id} sentAt={l.whatsapp_sent_at} sentBy={l.whatsapp_sent_by} skippedAt={l.whatsapp_skipped_at} skippedBy={l.whatsapp_skipped_by} />,
  };

  if (variant === "tracking") {
    cols.push(...activity, ticket, whatsapp);
  } else if (variant === "upgraded") {
    cols.push(
      { head: "Nhóm", cell: (l) => (l.group === "control" ? <Pill>Đối chứng</Pill> : <Pill tone="primary">Test</Pill>) },
      { head: "Plan", cell: (l) => `${l.plan_at_send ?? "Free"} → ${l.upgraded_to ?? l.current_plan ?? "?"}` },
      { head: "Ngày nâng cấp", cell: (l) => fmtVN(l.upgraded_at, true) },
      { head: "MRR tăng", cell: (l) => <span className="font-semibold text-pf-success">{money(l.mrr_added)}</span> },
      {
        head: "Gửi → nâng cấp",
        cell: (l) => (l.sent_at && l.upgraded_at ? `${Math.max(0, Math.round((new Date(l.upgraded_at).getTime() - new Date(l.sent_at).getTime()) / 86_400_000))} ngày` : "—"),
      },
      { head: "PIC", cell: (l) => l.pic ?? "—" },
      ...activity,
      ticket,
      whatsapp,
    );
  } else if (variant === "queue") {
    cols.push(
      { head: "Điểm", cell: (l) => l.lead_score ?? "—" },
      { head: "Ngành hàng", cell: (l) => <span className="line-clamp-1 max-w-[200px]">{l.category_hint ?? "—"}</span> },
      { head: "Thêm lúc", cell: (l) => fmtVN(l.created_at) },
      {
        head: "Build",
        cell: (l) =>
          l.status === "building" ? (
            <span className={hoursSince(l.build_started_at) > 3 ? "text-pf-danger" : ""}>từ {fmtVN(l.build_started_at)}</span>
          ) : l.status === "rebuild_requested" ? (
            <span className="line-clamp-2 max-w-[260px] text-[12px] text-pf-warn">{l.rebuild_note}</span>
          ) : (
            "—"
          ),
      },
      { head: "Ưu tiên", cell: (l) => (l.priority === "high" ? <Pill tone="bad">Cao</Pill> : "—") },
    );
  } else if (variant === "control") {
    cols.push(
      { head: "Điểm", cell: (l) => l.lead_score ?? "—" },
      { head: "Ngành hàng", cell: (l) => <span className="line-clamp-1 max-w-[200px]">{l.category_hint ?? "—"}</span> },
      { head: "Thêm lúc", cell: (l) => fmtVN(l.created_at) },
      { head: "Plan hiện tại", cell: (l) => l.current_plan ?? l.plan_at_send ?? "—" },
      { head: "Nâng cấp", cell: (l) => (l.upgraded ? <span className="text-pf-success">✓ {money(l.mrr_added)}</span> : "—") },
      { head: "App", cell: (l) => l.app_status ?? "—" },
    );
  } else {
    cols.push(
      {
        head: "Lý do",
        cell: (l) => (
          <span className="line-clamp-2 max-w-[340px] text-[12px] text-pf-muted">
            {l.status === "rejected" ? l.reject_reason : l.status === "uninstalled" ? `Gỡ app ${fmtVN(l.uninstalled_at)}` : l.error ?? "—"}
          </span>
        ),
      },
      { head: "Cập nhật", cell: (l) => fmtVN(l.updated_at) },
      { head: "", cell: (l) => <Requeue leadId={l.lead_id} /> },
    );
  }

  return (
    <div className="overflow-x-auto rounded-pf-card border border-pf-border">
      <table className="w-full text-left text-[12.5px]">
        <thead className="bg-pf-card-hi text-[11px] uppercase tracking-[0.06em] text-pf-faint">
          <tr>
            {cols.map((c) => (
              <th key={c.head} className="whitespace-nowrap px-3 py-2 font-semibold">
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr
              key={l.lead_id}
              onClick={
                rowOpens
                  ? (e) => {
                      if ((e.target as Element).closest("a, button, input, textarea, select")) return;
                      router.push(`/design/admin/upsell/leads/${l.lead_id}`);
                    }
                  : undefined
              }
              className={`border-t border-pf-border align-top ${rowOpens ? "cursor-pointer transition-colors hover:bg-pf-card-hi/60" : ""}`}
            >
              {cols.map((c) => (
                <td key={c.head} className="px-3 py-2.5 text-pf-body">
                  {c.cell(l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Requeue({ leadId }: { leadId: string }) {
  const [run, busy, error] = useAct();
  return (
    <div className="grid gap-1">
      <Button size="sm" variant="ghost" icon="RotateCcw" disabled={busy} onClick={() => run(`/api/admin/upsell/leads/${leadId}`, { action: "requeue" })}>
        Đưa về hàng đợi build
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}
