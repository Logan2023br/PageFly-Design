"use client";

import Link from "next/link";
import { useState } from "react";
import { KIND_LABEL, customerClock, draftReason, fmtVN, whatsappText } from "@/lib/upsell/format";
import type { MessageListRow } from "@/lib/upsell/adminQueries";
import { REPEATED_FAILURE } from "@/lib/upsell/types";
import { Button } from "../../ui";
import { FIELD } from "../collections/shared";
import { CopyButton, CrispLink, ErrorLine, PhoneLine, Pill, WhatsappMark, useAct } from "./bits";
import { Empty } from "./PendingPages";

/* ==========================================================================
   Tab 2 (drafts), tab 3 (approved, waiting for the customer's hours) and
   Lỗi gửi (the script reported the send failed).

   A draft is edited in place and approved as edited. "Duyệt" waits for the
   customer's business hours; "Duyệt & gửi ngay" goes on the script's next
   run. Waiting messages show the customer's clock, because "why hasn't this
   gone yet" is answered by it.

   A failed message is retried by approving it again — "Thử gửi lại" in the
   customer's hours, "Gửi lại ngay" on the next run — or dropped. Its failure
   count stays across retries; from REPEATED_FAILURE on it is flagged.
   ========================================================================== */

type Mode = "drafts" | "waiting" | "failed";

const EMPTY: Record<Mode, string> = {
  drafts: "Không có tin nào chờ duyệt.",
  waiting: "Không có tin nào đang chờ gửi.",
  failed: "Không có tin nào gửi lỗi.",
};

export function MessageQueue({
  rows,
  mode,
  window,
}: {
  rows: MessageListRow[];
  mode: Mode;
  window: { start: number; end: number };
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [run, busy, error] = useAct();
  if (rows.length === 0) return <Empty text={EMPTY[mode]} />;
  const bulk = (send_mode: "window" | "now") =>
    run("/api/admin/upsell/bulk", { kind: "messages", ids: [...picked], send_mode }).then((ok) => ok && setPicked(new Set()));

  return (
    <div className="grid gap-3">
      {mode !== "waiting" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-pf-muted">
            <input type="checkbox" checked={picked.size === rows.length} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
            Chọn tất cả
          </label>
          {mode === "drafts" && picked.size > 0 && (
            <>
              <Button size="sm" icon="Check" disabled={busy} onClick={() => bulk("window")}>
                Duyệt {picked.size} tin
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => bulk("now")}>
                Duyệt & gửi ngay
              </Button>
            </>
          )}
          {mode === "failed" && (
            <Button size="sm" icon="RotateCcw" disabled={busy || picked.size === 0} onClick={() => bulk("window")}>
              Thử gửi lại các tin đã chọn{picked.size > 0 ? ` (${picked.size})` : ""}
            </Button>
          )}
          <ErrorLine error={error} />
        </div>
      )}
      {rows.map((m) => (
        <MessageCard
          key={m.id}
          m={m}
          mode={mode}
          window={window}
          picked={picked.has(m.id)}
          onPick={() =>
            setPicked((s) => {
              const n = new Set(s);
              if (n.has(m.id)) n.delete(m.id);
              else n.add(m.id);
              return n;
            })
          }
        />
      ))}
    </div>
  );
}

function MessageCard({
  m,
  mode,
  window,
  picked,
  onPick,
}: {
  m: MessageListRow;
  mode: Mode;
  window: { start: number; end: number };
  picked: boolean;
  onPick: () => void;
}) {
  const [content, setContent] = useState(m.content);
  const [run, busy, error] = useAct();
  const clock = customerClock(m.timezone, window.start, window.end);
  const url = `/api/admin/upsell/messages/${m.id}`;
  return (
    <article className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4 lg:grid-cols-[260px_1fr]">
      <div className="grid content-start gap-1.5">
        <div className="flex items-start gap-2">
          {mode !== "waiting" && <input type="checkbox" className="mt-1" checked={picked} onChange={onPick} aria-label="Chọn tin" />}
          <div className="min-w-0">
            <Link href={`/design/admin/upsell/leads/${m.lead_id}`} className="font-semibold text-pf-text hover:text-pf-primary-hi">
              {m.store_name || m.store_domain}
            </Link>
            <p className="truncate text-[11.5px] text-pf-faint">{m.store_domain}</p>
            <PhoneLine phone={m.phone} />
            <div className="mt-1.5">
              <WhatsappMark
                leadId={m.lead_id}
                sentAt={m.whatsapp_sent_at}
                sentBy={m.whatsapp_sent_by}
                skippedAt={m.whatsapp_skipped_at}
                skippedBy={m.whatsapp_skipped_by}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone="primary">{KIND_LABEL[m.kind] ?? m.kind}</Pill>
          {m.send_mode === "now" && mode === "waiting" && <Pill tone="warn">Gửi ngay</Pill>}
          {mode === "failed" && m.attempts >= REPEATED_FAILURE && <Pill tone="bad">Lỗi nhiều lần</Pill>}
        </div>
        {mode === "failed" ? (
          <>
            <p className="text-[12.5px] font-medium text-pf-danger">{m.error || "Không rõ lý do"}</p>
            <p className="flex items-center gap-2 text-[11.5px] text-pf-faint">
              Ticket: <CrispLink href={m.ticket_link} />
            </p>
          </>
        ) : (
          <p className="text-[12.5px] text-pf-body">{draftReason(m)}</p>
        )}
        {m.feedback_summary && <p className="text-[12px] text-pf-muted">“{m.feedback_summary}”</p>}
        <p className="text-[11.5px] text-pf-faint">
          Giờ khách: <span className={clock.inWindow ? "text-pf-success" : "text-pf-warn"}>{clock.time}</span> ({clock.tz})
          {mode === "waiting" && !clock.inWindow && m.send_mode !== "now" && ` · gửi khi tới ${window.start}h`}
        </p>
        <p className="text-[11.5px] text-pf-faint">
          {mode === "drafts"
            ? `Soạn ${fmtVN(m.created_at)}`
            : mode === "failed"
              ? `Lỗi ${fmtVN(m.failed_at)} · đã thử ${m.attempts} lần`
              : `Duyệt ${fmtVN(m.approved_at)} · ${m.approved_by?.replace(/^admin:/, "") ?? ""}`}
        </p>
      </div>
      <div className="grid gap-2">
        {mode === "drafts" ? (
          <textarea className={`${FIELD} min-h-[160px] font-mono text-[12.5px]`} value={content} onChange={(e) => setContent(e.target.value)} aria-label="Nội dung tin" />
        ) : (
          <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-pf-md border border-pf-border bg-pf-bg-deep p-3 font-mono text-[12.5px] text-pf-body">{m.content}</pre>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {mode === "drafts" ? (
            <>
              <Button size="sm" icon="Check" disabled={busy} onClick={() => run(url, { action: "approve", content, send_mode: "window" })}>
                Duyệt
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(url, { action: "approve", content, send_mode: "now" })}>
                Duyệt & gửi ngay
              </Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => run(url, { action: "reject" })}>
                Bỏ
              </Button>
              <CopyButton text={content} label="Copy Crisp" />
              <CopyButton text={whatsappText(content)} label="Copy WhatsApp" />
            </>
          ) : mode === "failed" ? (
            <>
              <Button size="sm" icon="RotateCcw" disabled={busy} onClick={() => run(url, { action: "approve", send_mode: "window" })}>
                Thử gửi lại
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(url, { action: "approve", send_mode: "now" })}>
                Gửi lại ngay
              </Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => run(url, { action: "reject" })}>
                Bỏ
              </Button>
            </>
          ) : (
            <>
              {m.send_mode !== "now" && (
                <Button size="sm" icon="Rocket" disabled={busy} onClick={() => run(url, { action: "send_now" })}>
                  Gửi ngay
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(url, { action: "unapprove" })}>
                Huỷ duyệt
              </Button>
              {m.kind === "initial" && <span className="text-[11.5px] text-pf-faint">Huỷ duyệt tin đầu tiên đưa lead về Chờ duyệt page.</span>}
            </>
          )}
          <ErrorLine error={error} />
        </div>
      </div>
    </article>
  );
}
