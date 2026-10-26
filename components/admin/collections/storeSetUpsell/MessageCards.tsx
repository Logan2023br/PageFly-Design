"use client";

import { useState } from "react";
import { fmtVN, whatsappText } from "@/lib/upsell/format";
import type { MessageListRow } from "@/lib/storeSetUpsell/queries";
import { SSU_KIND_LABEL } from "@/lib/storeSetUpsell/types";
import { Button } from "../../../ui";
import { CopyButton, CrispLink, ErrorLine, PhoneLine, Pill, useAct } from "../../upsell/bits";
import { FIELD } from "../shared";

/* ==========================================================================
   Chờ duyệt (drafts), Chờ gửi (approved, the minute job sends them) and
   Lỗi gửi. A draft is edited in place and approved as edited:
     "Duyệt & gửi"  sends on Crisp now, from Logan, after checking the 5★
                    rule once more;
     "Duyệt"        leaves it for the minute job.
   ========================================================================== */

const API = "/api/admin/collection-pages/store-set-upsell/messages";

type Mode = "pending" | "waiting" | "failed";

const EMPTY: Record<Mode, string> = {
  pending: "Không có tin nào chờ duyệt.",
  waiting: "Không có tin nào đang chờ gửi.",
  failed: "Không có tin nào gửi lỗi.",
};

export function MessageCards({ rows, mode }: { rows: MessageListRow[]; mode: Mode }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [run, busy, error] = useAct();
  if (rows.length === 0)
    return <p className="rounded-pf-card border border-pf-border bg-pf-card p-6 text-center text-[13px] text-pf-muted">{EMPTY[mode]}</p>;
  const bulk = (action: "approve" | "reject") =>
    run(`${API}/bulk`, { ids: [...picked], action }).then((ok) => ok && setPicked(new Set()));

  return (
    <div className="grid gap-3">
      {mode !== "waiting" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12.5px] text-pf-muted">
            <input
              type="checkbox"
              checked={picked.size === rows.length}
              onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
            />
            Chọn tất cả
          </label>
          {picked.size > 0 && (
            <>
              <Button size="sm" icon="Check" disabled={busy} onClick={() => bulk("approve")}>
                {mode === "failed" ? "Gửi lại" : "Duyệt"} {picked.size} tin
              </Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => bulk("reject")}>
                Bỏ {picked.size} tin
              </Button>
              <span className="text-[11.5px] text-pf-faint">Tin duyệt hàng loạt được gửi dần ở các lượt chạy mỗi phút.</span>
            </>
          )}
          <ErrorLine error={error} />
        </div>
      )}
      {rows.map((m) => (
        <MessageCard
          key={m.id}
          m={m}
          mode={mode}
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

function MessageCard({ m, mode, picked, onPick }: { m: MessageListRow; mode: Mode; picked: boolean; onPick: () => void }) {
  const [content, setContent] = useState(m.content);
  const [run, busy, error] = useAct();
  const url = `${API}/${m.id}`;
  return (
    <article className="grid gap-3 rounded-pf-card border border-pf-border bg-pf-card p-4 lg:grid-cols-[280px_1fr]">
      <div className="grid content-start gap-1.5">
        <div className="flex items-start gap-2">
          {mode !== "waiting" && <input type="checkbox" className="mt-1" checked={picked} onChange={onPick} aria-label="Chọn tin" />}
          <div className="min-w-0">
            <a href={`https://${m.store_domain}`} target="_blank" rel="noreferrer" className="font-semibold text-pf-text hover:text-pf-primary-hi">
              {m.store_name || m.store_domain}
            </a>
            <p className="truncate text-[11.5px] text-pf-faint">{m.store_domain}</p>
            <p className="truncate text-[12px] text-pf-body">{m.email ?? "—"}</p>
            <PhoneLine phone={m.phone} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone="primary">{SSU_KIND_LABEL[m.kind] ?? m.kind}</Pill>
          {m.sets.map((s) => (
            <Pill key={s}>{s}</Pill>
          ))}
        </div>
        <p className="text-[12px] text-pf-muted">
          {m.pf_plan ?? "—"} · Crisp: {m.crisp_conversations ?? 0} hội thoại · app_review {m.app_review ?? "trống"}
        </p>
        <p className="text-[11.5px] text-pf-faint">Chọn template {fmtVN(m.last_selected_at)}</p>
        {mode === "failed" ? (
          <>
            <p className="text-[12.5px] font-medium text-pf-danger">{m.error || "Không rõ lý do"}</p>
            <p className="text-[11.5px] text-pf-faint">
              Lỗi {fmtVN(m.failed_at)} · đã thử {m.attempts} lần
            </p>
          </>
        ) : (
          <p className="text-[11.5px] text-pf-faint">
            {mode === "pending" ? `Soạn ${fmtVN(m.created_at)} · ${m.created_by.replace(/^admin:/, "")}` : `Duyệt ${fmtVN(m.approved_at)} · ${m.approved_by?.replace(/^admin:/, "") ?? ""}`}
          </p>
        )}
        {m.rerender && <p className="text-[11.5px] text-pf-faint">Soạn từ mẫu: ngày hết hạn, số ngày còn lại và danh sách page được tính lại lúc gửi.</p>}
        <CrispLink href={m.ticket_link} />
      </div>
      <div className="grid gap-2">
        {mode !== "waiting" ? (
          <textarea className={`${FIELD} min-h-[200px] font-mono text-[12.5px]`} value={content} onChange={(e) => setContent(e.target.value)} aria-label="Nội dung tin" />
        ) : (
          <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-pf-md border border-pf-border bg-pf-bg-deep p-3 font-mono text-[12.5px] text-pf-body">{m.content}</pre>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {mode !== "waiting" && (
            <>
              <Button size="sm" icon="Rocket" disabled={busy} onClick={() => run(url, { action: "approve", content })}>
                {mode === "failed" ? "Gửi lại ngay" : "Duyệt & gửi"}
              </Button>
              <Button size="sm" variant="ghost" icon="Check" disabled={busy} onClick={() => run(url, { action: "approve_later", content })}>
                Duyệt (gửi ở lượt chạy tới)
              </Button>
            </>
          )}
          <Button size="sm" variant="danger" disabled={busy} onClick={() => run(url, { action: "reject" })}>
            Bỏ
          </Button>
          <CopyButton text={content} label="Copy Crisp" />
          <CopyButton text={whatsappText(content)} label="Copy WhatsApp" />
          {busy && <span className="text-[12px] text-pf-muted">Đang kiểm tra review và gửi…</span>}
          <ErrorLine error={error} />
        </div>
      </div>
    </article>
  );
}
