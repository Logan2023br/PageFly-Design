"use client";

import Link from "next/link";
import type { MessageGroup, ReplyRow } from "@/lib/upsell/adminQueries";
import { KIND_LABEL, fmtVN } from "@/lib/upsell/format";
import { Button } from "../../ui";
import { CrispLink, ErrorLine, PhoneLine, Pill, useAct } from "./bits";
import { Empty } from "./PendingPages";

/* ==========================================================================
   Tab — Có phản hồi. Three buttons, one per kind of message the reply
   answers (the last message sent before it): build page, khách đã xem,
   khách đã tải — each with how many replies nobody has checked yet. Then
   the replies, unchecked first; "Đã kiểm tra" marks one read by the team,
   as on Upsell Collection Pages. A newer reply is unchecked again.
   ========================================================================== */

export const REPLY_GROUPS: { id: MessageGroup; label: string }[] = [
  { id: "build", label: "Phản hồi tin build page" },
  { id: "viewed", label: "Phản hồi tin khách đã xem" },
  { id: "downloaded", label: "Phản hồi tin khách đã tải" },
];

const BASE = "/design/admin/upsell?tab=replied";

export function ReplyNav({
  current,
  check,
  counts,
}: {
  current: MessageGroup;
  check: "0" | "1" | undefined;
  counts: Record<MessageGroup, { total: number; unchecked: number }>;
}) {
  const c = counts[current];
  const chips: [string, "0" | "1" | undefined, number][] = [
    ["Tất cả", undefined, c.total],
    ["Chưa kiểm tra", "0", c.unchecked],
    ["Đã kiểm tra", "1", c.total - c.unchecked],
  ];
  return (
    <div className="grid gap-3">
      <nav aria-label="Phản hồi theo loại tin" className="flex flex-wrap gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
        {REPLY_GROUPS.map((g) => {
          const active = g.id === current;
          const n = counts[g.id];
          return (
            <Link
              key={g.id}
              href={`${BASE}&group=${g.id}`}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                active ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text"
              }`}
            >
              {g.label}
              {n.unchecked > 0 && (
                <span
                  title="Chưa kiểm tra"
                  className={`rounded-pf-pill px-1.5 text-[11px] ${active ? "bg-white/20" : "bg-pf-warn/20 text-pf-warn"}`}
                >
                  {n.unchecked}
                </span>
              )}
              <span className={`text-[11px] font-medium ${active ? "text-white/80" : "text-pf-faint"}`}>{n.total} phản hồi</span>
            </Link>
          );
        })}
      </nav>
      <nav aria-label="Kiểm tra" className="flex w-fit gap-1 rounded-xl border border-pf-border bg-pf-surface/60 p-1">
        {chips.map(([label, v, n]) => (
          <Link
            key={label}
            href={`${BASE}&group=${current}${v ? `&check=${v}` : ""}`}
            aria-current={check === v ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] font-semibold transition-colors ${
              check === v ? "bg-pf-primary text-white" : "text-pf-muted hover:text-pf-text"
            }`}
          >
            {label}
            <span className={`rounded-pf-pill px-1.5 text-[11px] ${check === v ? "bg-white/20" : "bg-pf-card-hi text-pf-faint"}`}>{n}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function ReplyCards({ rows }: { rows: ReplyRow[] }) {
  if (rows.length === 0) return <Empty text="Không có phản hồi nào." />;
  return (
    <div className="grid gap-3">
      {rows.map((l) => (
        <ReplyCard key={l.lead_id} l={l} />
      ))}
    </div>
  );
}

function ReplyCard({ l }: { l: ReplyRow }) {
  const [run, busy, error] = useAct();
  const url = `/api/admin/upsell/leads/${l.lead_id}`;
  const checked = Boolean(l.reply_checked_at && l.last_reply_at && new Date(l.reply_checked_at).getTime() >= new Date(l.last_reply_at).getTime());
  return (
    <article
      className={`grid gap-3 rounded-pf-card border bg-pf-card p-4 ${checked ? "border-pf-border" : "border-pf-warn/40"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/design/admin/upsell/leads/${l.lead_id}`} className="font-semibold text-pf-text hover:text-pf-primary-hi">
            {l.store_name || l.store_domain}
          </Link>
          <p className="text-[11.5px] text-pf-faint">
            {l.store_domain} · {l.lead_id}
          </p>
          <PhoneLine phone={l.phone} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="primary">Trả lời: {KIND_LABEL[l.reply_to_kind] ?? l.reply_to_kind}</Pill>
          {l.sentiment && <Pill tone={l.sentiment === "Positive" ? "ok" : l.sentiment === "Negative" ? "bad" : "muted"}>{l.sentiment}</Pill>}
          {l.upgraded && <Pill tone="ok">Đã nâng cấp</Pill>}
          <span className="text-[12px] text-pf-faint">Phản hồi {fmtVN(l.last_reply_at)}</span>
        </div>
      </div>

      {l.last_reply_text && (
        <blockquote className="whitespace-pre-wrap rounded-pf-md border-l-2 border-pf-primary-hi bg-pf-bg-deep px-3 py-2 text-[12.5px] text-pf-body">
          {l.last_reply_text}
        </blockquote>
      )}
      {l.feedback_summary && <p className="text-[12px] text-pf-muted">Tóm tắt: {l.feedback_summary}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {checked ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(url, { action: "reply_check", checked: false })}
            title="Bấm để bỏ đánh dấu"
            className="inline-flex h-8 items-center gap-1.5 rounded-pf-md border border-pf-success/30 bg-pf-success/10 px-3 text-[12.5px] font-semibold text-pf-success transition-colors hover:bg-pf-success/20 disabled:opacity-50"
          >
            ✓ Đã kiểm tra · {l.reply_checked_by?.replace(/^admin:/, "")} {fmtVN(l.reply_checked_at)}
          </button>
        ) : (
          <Button size="sm" icon="Check" disabled={busy} onClick={() => void run(url, { action: "reply_check", checked: true })}>
            Đã kiểm tra
          </Button>
        )}
        <CrispLink href={l.ticket_link} />
        <ErrorLine error={error} />
      </div>
    </article>
  );
}
